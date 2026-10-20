import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EmailCampaignEventsRepository } from './email-campaign-events.repository';
import { EmailCampaignMessagesRepository } from './email-campaign-messages.repository';
import { EmailCampaignRecipientsRepository } from './email-campaign-recipients.repository';
import type { EmailCampaignMessageEntity } from './entities/email-campaign-message.entity';
import type { EmailCampaignRecipientEntity } from './entities/email-campaign-recipient.entity';

@Injectable()
export class CampaignEventBackfillService implements OnModuleInit {
  private readonly logger = new Logger(CampaignEventBackfillService.name);

  constructor(
    private readonly eventsRepository: EmailCampaignEventsRepository,
    private readonly messagesRepository: EmailCampaignMessagesRepository,
    private readonly recipientsRepository: EmailCampaignRecipientsRepository,
  ) {}

  onModuleInit(): void {
    setImmediate(() => {
      void this.backfillIfNeeded().catch((error: unknown) => {
        this.logger.warn(
          `Campaign event backfill skipped: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    });
  }

  private async backfillIfNeeded(): Promise<void> {
    const messageCount = await this.messagesRepository.countAll();

    if (messageCount === 0) {
      return;
    }

    const eventCount = await this.eventsRepository.count();

    if (eventCount > 0) {
      return;
    }

    this.logger.log(
      'Backfilling campaign events from existing aggregate data…',
    );

    const pageSize = 200;
    let messageSkip = 0;
    let backfilledMessages = 0;

    for (;;) {
      const messages = await this.messagesRepository.findPageOrderedByCreatedAt(
        messageSkip,
        pageSize,
      );

      if (messages.length === 0) {
        break;
      }

      for (const message of messages) {
        await this.backfillMessage(message);
      }

      backfilledMessages += messages.length;
      messageSkip += messages.length;
    }

    let recipientSkip = 0;

    for (;;) {
      const recipients = await this.recipientsRepository.findPage(
        recipientSkip,
        pageSize,
      );

      if (recipients.length === 0) {
        break;
      }

      for (const recipient of recipients) {
        await this.backfillRecipientEvents(recipient);
      }

      recipientSkip += recipients.length;
    }

    this.logger.log(`Backfilled events for ${backfilledMessages} messages`);
  }

  private async backfillRecipientEvents(
    recipient: EmailCampaignRecipientEntity,
  ): Promise<void> {
    if (recipient.repliedAt) {
      const hasReply =
        await this.eventsRepository.existsByRecipientIdAndEventType(
          recipient.id,
          'reply',
        );

      if (!hasReply) {
        await this.eventsRepository.insert({
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          messageId: null,
          eventType: 'reply',
          occurredAt: recipient.repliedAt,
          metadata: { source: 'imap' },
        });
      }
    }

    if (recipient.contactDisposition === 'unsubscribed') {
      const hasUnsub =
        await this.eventsRepository.existsByRecipientIdAndEventType(
          recipient.id,
          'unsubscribe',
        );

      if (!hasUnsub) {
        await this.eventsRepository.insert({
          campaignId: recipient.campaignId,
          recipientId: recipient.id,
          messageId: null,
          eventType: 'unsubscribe',
          occurredAt: recipient.repliedAt ?? recipient.lastSentAt ?? new Date(),
          metadata: {},
        });
      }
    }
  }

  private async backfillMessage(
    message: EmailCampaignMessageEntity,
  ): Promise<void> {
    if (message.sentAt && message.deliveryStatus === 'sent') {
      await this.eventsRepository.insert({
        campaignId: message.campaignId,
        recipientId: message.recipientId,
        messageId: message.id,
        eventType: 'sent',
        occurredAt: message.sentAt,
        metadata: {
          stepOrder: message.stepOrder,
          providerMessageId: message.providerMessageId,
        },
      });
    }

    if (message.openedAt && message.openCount > 0) {
      await this.eventsRepository.insert({
        campaignId: message.campaignId,
        recipientId: message.recipientId,
        messageId: message.id,
        eventType: 'open',
        occurredAt: message.openedAt,
        metadata: { stepOrder: message.stepOrder },
      });
    }

    if (message.clickedAt && message.clickCount > 0) {
      await this.eventsRepository.insert({
        campaignId: message.campaignId,
        recipientId: message.recipientId,
        messageId: message.id,
        eventType: 'click',
        occurredAt: message.clickedAt,
        metadata: { stepOrder: message.stepOrder },
      });
    }

    if (message.bouncedAt && message.deliveryStatus !== 'sent') {
      const eventType =
        message.openCount === 0 && message.clickCount === 0
          ? message.bounceReason?.includes('Send failed') ||
            message.bounceReason?.includes('SMTP')
            ? 'send_failed'
            : 'bounce'
          : null;

      if (eventType) {
        await this.eventsRepository.insert({
          campaignId: message.campaignId,
          recipientId: message.recipientId,
          messageId: message.id,
          eventType,
          occurredAt: message.bouncedAt,
          metadata: {
            reason: message.bounceReason ?? undefined,
            source: eventType === 'send_failed' ? 'smtp' : 'imap',
            stepOrder: message.stepOrder,
          },
        });
      }
    }
  }
}
