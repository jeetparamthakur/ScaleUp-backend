import { Injectable, Logger } from '@nestjs/common';
import { resolveOpenWaInboundPhoneDigits } from './utils/openwa-inbound-phone.util';
import { WhatsappCampaignEventsRepository } from './whatsapp-campaign-events.repository';
import { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';

@Injectable()
export class WhatsappCampaignReplyService {
  private readonly logger = new Logger(WhatsappCampaignReplyService.name);

  constructor(
    private readonly recipientsRepository: WhatsappCampaignRecipientsRepository,
    private readonly eventsRepository: WhatsappCampaignEventsRepository,
  ) {}

  async handleInbound(
    senderConnectionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const phoneDigits = resolveOpenWaInboundPhoneDigits(payload);
    if (!phoneDigits) {
      return;
    }

    const recipient =
      await this.recipientsRepository.findMostRecentSentForReply(
        senderConnectionId,
        phoneDigits,
      );

    if (
      !recipient ||
      recipient.status === 'replied' ||
      recipient.sentAt === null
    ) {
      return;
    }

    const body =
      typeof payload.body === 'string' ? payload.body.slice(0, 2000) : null;

    await this.recordReplyForRecipient(recipient.id, body, new Date());
  }

  async recordReplyForRecipient(
    recipientId: string,
    body: string | null,
    repliedAt: Date,
  ): Promise<void> {
    const recipient = await this.recipientsRepository.findById(recipientId);
    if (
      !recipient ||
      recipient.status === 'replied' ||
      recipient.sentAt === null ||
      (recipient.status !== 'sent' && recipient.status !== 'pending')
    ) {
      return;
    }

    const trimmedBody = body?.slice(0, 2000) ?? null;

    recipient.status = 'replied';
    recipient.repliedAt = repliedAt;
    recipient.replyBody = trimmedBody;
    recipient.nextSendAt = null;
    await this.recipientsRepository.save(recipient);

    await this.eventsRepository.createEvent({
      campaignId: recipient.campaignId,
      recipientId: recipient.id,
      eventType: 'reply',
      metadata: trimmedBody ? { body: trimmedBody } : null,
    });

    this.logger.log(
      `Marked campaign recipient ${recipient.id} as replied (campaign ${recipient.campaignId})`,
    );
  }
}
