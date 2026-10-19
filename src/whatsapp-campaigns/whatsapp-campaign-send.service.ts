import { Injectable } from '@nestjs/common';
import {
  computeNextSendAtForStep,
  DEFAULT_ACTIVE_WEEKDAYS,
} from '../email-campaigns/campaign-schedule.util';
import { OpenWaHttpClient } from '../inbox/whatsapp/openwa-http.client';
import { PlatformOpenWaService } from '../inbox/whatsapp/platform-openwa.service';
import type { WhatsappSenderConnectionEntity } from '../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';
import {
  getSenderRemainingDailyCapacity,
  incrementSenderDailySendCount,
} from '../whatsapp-sender-connections/utils/sender-daily.util';
import { WhatsappSenderConnectionRepository } from '../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import type { WhatsappCampaignEntity } from './entities/whatsapp-campaign.entity';
import type { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import type { WhatsappCampaignSenderEntity } from './entities/whatsapp-campaign-sender.entity';
import { phoneToOpenWaChatId } from './utils/phone-to-openwa-chat-id.util';
import {
  applyCampaignDailyReset,
  computeNextDailyBatchWindowStart,
  getCampaignRemainingDailyBatch,
  incrementCampaignDailySendCount,
} from './utils/whatsapp-campaign-daily.util';
import { computeNextSendEligibleAt } from './utils/whatsapp-campaign-send-spacing.util';
import {
  computeNextSendingWindowOpen,
  hasWhatsappCampaignSendingWindow,
  isWhatsappCampaignInSendingWindow,
} from './utils/whatsapp-campaign-sending-window.util';
import { WhatsappCampaignEventsRepository } from './whatsapp-campaign-events.repository';
import { WhatsappCampaignMessagesRepository } from './whatsapp-campaign-messages.repository';
import { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';
import { WhatsappCampaignsRepository } from './whatsapp-campaigns.repository';
import { WhatsappCampaignSendersRepository } from './whatsapp-campaign-senders.repository';
import { WhatsappCampaignSequenceStepsRepository } from './whatsapp-campaign-sequence-steps.repository';

const MESSAGES_PER_TICK = 1;

@Injectable()
export class WhatsappCampaignSendService {
  constructor(
    private readonly campaignsRepository: WhatsappCampaignsRepository,
    private readonly sendersRepository: WhatsappCampaignSendersRepository,
    private readonly recipientsRepository: WhatsappCampaignRecipientsRepository,
    private readonly messagesRepository: WhatsappCampaignMessagesRepository,
    private readonly eventsRepository: WhatsappCampaignEventsRepository,
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly sequenceStepsRepository: WhatsappCampaignSequenceStepsRepository,
  ) {}

  private resolveCampaignTimezone(campaign: WhatsappCampaignEntity): string {
    const trimmed = campaign.timezone?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'UTC';
  }

  async processCampaign(
    campaign: WhatsappCampaignEntity,
    now = new Date(),
  ): Promise<void> {
    if (campaign.launchAt && campaign.launchAt > now) {
      return;
    }

    if (
      campaign.nextSendEligibleAt &&
      campaign.nextSendEligibleAt.getTime() > now.getTime()
    ) {
      return;
    }

    if (!hasWhatsappCampaignSendingWindow(campaign)) {
      return;
    }

    if (!isWhatsappCampaignInSendingWindow(campaign, now)) {
      await this.deferUntilSendingWindow(campaign, now);
      return;
    }

    const dateRolled = applyCampaignDailyReset(campaign, now);
    if (dateRolled) {
      await this.campaignsRepository.save(campaign);
    }

    if (getCampaignRemainingDailyBatch(campaign, now) <= 0) {
      await this.pauseUntilNextDailyBatchIfPending(campaign, now);
      return;
    }

    if (campaign.status === 'scheduled') {
      campaign.status = 'sending';
      await this.campaignsRepository.save(campaign);
    }

    const campaignSenders = await this.sendersRepository.listByCampaign(
      campaign.id,
    );
    if (campaignSenders.length === 0) {
      return;
    }

    const senderIds = campaignSenders.map((row) => row.senderConnectionId);
    const readySenders =
      await this.senderConnectionRepository.listReadyByIdsForOrg(
        campaign.organizationId,
        senderIds,
      );

    if (readySenders.length === 0) {
      return;
    }

    const steps = await this.sequenceStepsRepository.listByCampaignId(
      campaign.id,
    );
    if (steps.length === 0) {
      return;
    }

    const dueRecipients = await this.recipientsRepository.findNextDue(
      campaign.id,
      MESSAGES_PER_TICK,
      now,
    );

    if (dueRecipients.length === 0) {
      await this.completeIfDone(campaign);
      return;
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const timezone = this.resolveCampaignTimezone(campaign);

    let senderIndex = 0;

    for (const recipient of dueRecipients) {
      if (recipient.status !== 'pending') {
        continue;
      }

      const step = steps.find(
        (candidate) => candidate.stepOrder === recipient.currentStepOrder,
      );

      if (!step) {
        recipient.status = 'sent';
        recipient.nextSendAt = null;
        await this.recipientsRepository.save(recipient);
        continue;
      }

      if (getCampaignRemainingDailyBatch(campaign, now) <= 0) {
        await this.pauseUntilNextDailyBatchIfPending(campaign, now);
        break;
      }

      const sender = this.resolveSenderForRecipient(
        recipient,
        readySenders,
        campaignSenders,
        senderIndex,
        now,
      );

      if (!sender) {
        await this.pauseUntilNextDailyBatchIfPending(campaign, now);
        break;
      }

      senderIndex = (senderIndex + 1) % readySenders.length;

      if (!sender.openwaSessionId) {
        continue;
      }

      try {
        const chatId = phoneToOpenWaChatId(recipient.phoneE164);
        const response = await this.openWaClient.sendText(
          baseUrl,
          apiKey,
          sender.openwaSessionId,
          chatId,
          step.body,
        );

        const sentAt = new Date();
        recipient.sentAt = sentAt;
        recipient.senderConnectionId = sender.id;
        recipient.lastError = null;

        const nextStep = steps.find(
          (candidate) => candidate.stepOrder === recipient.currentStepOrder + 1,
        );

        if (nextStep) {
          recipient.currentStepOrder = nextStep.stepOrder;
          recipient.nextSendAt = computeNextSendAtForStep(
            nextStep,
            sentAt,
            campaign.sendingWindowStartMinutes ?? 0,
            timezone,
            [...DEFAULT_ACTIVE_WEEKDAYS],
          );
          recipient.status = 'pending';
        } else {
          recipient.status = 'sent';
          recipient.nextSendAt = null;
        }

        await this.recipientsRepository.save(recipient);

        incrementSenderDailySendCount(sender, now);
        await this.senderConnectionRepository.save(sender);

        incrementCampaignDailySendCount(campaign, now);
        campaign.nextSendEligibleAt = computeNextSendEligibleAt(
          campaign,
          sentAt,
        );
        await this.campaignsRepository.save(campaign);

        await this.messagesRepository.createMessage({
          recipientId: recipient.id,
          externalMessageId: response.messageId,
          body: step.body,
          stepOrder: step.stepOrder,
        });

        await this.eventsRepository.createEvent({
          campaignId: campaign.id,
          recipientId: recipient.id,
          eventType: 'sent',
          metadata: { stepOrder: step.stepOrder },
        });
      } catch (error) {
        recipient.status = 'failed';
        recipient.lastError =
          error instanceof Error ? error.message : String(error);
        await this.recipientsRepository.save(recipient);

        await this.eventsRepository.createEvent({
          campaignId: campaign.id,
          recipientId: recipient.id,
          eventType: 'failed',
          metadata: { error: recipient.lastError },
        });
      }
    }

    await this.completeIfDone(campaign);
  }

  private resolveSenderForRecipient(
    recipient: WhatsappCampaignRecipientEntity,
    readySenders: WhatsappSenderConnectionEntity[],
    campaignSenders: WhatsappCampaignSenderEntity[],
    startIndex: number,
    now: Date,
  ): WhatsappSenderConnectionEntity | null {
    if (recipient.senderConnectionId) {
      const preset = readySenders.find(
        (row) => row.id === recipient.senderConnectionId,
      );
      if (!preset || !preset.openwaSessionId) {
        return null;
      }

      const remaining = getSenderRemainingDailyCapacity(preset, now);
      if (remaining !== null && remaining <= 0) {
        return null;
      }

      return preset;
    }

    return this.pickSenderWithCapacity(
      readySenders,
      campaignSenders,
      startIndex,
      now,
    );
  }

  private pickSenderWithCapacity(
    readySenders: WhatsappSenderConnectionEntity[],
    campaignSenders: WhatsappCampaignSenderEntity[],
    startIndex: number,
    now: Date,
  ) {
    const order = campaignSenders
      .map((row) => row.senderConnectionId)
      .filter((id) => readySenders.some((sender) => sender.id === id));

    for (let offset = 0; offset < order.length; offset += 1) {
      const connectionId = order[(startIndex + offset) % order.length];
      const sender = readySenders.find((row) => row.id === connectionId);
      if (!sender) {
        continue;
      }

      const remaining = getSenderRemainingDailyCapacity(sender, now);
      if (remaining === null || remaining > 0) {
        return sender;
      }
    }

    return null;
  }

  private async deferUntilSendingWindow(
    campaign: WhatsappCampaignEntity,
    now: Date,
  ): Promise<void> {
    const nextOpen = computeNextSendingWindowOpen(campaign, now);
    const shouldUpdate =
      !campaign.nextSendEligibleAt ||
      campaign.nextSendEligibleAt.getTime() < nextOpen.getTime();

    if (shouldUpdate) {
      campaign.nextSendEligibleAt = nextOpen;
      await this.campaignsRepository.save(campaign);
    }
  }

  private async pauseUntilNextDailyBatchIfPending(
    campaign: WhatsappCampaignEntity,
    now: Date,
  ): Promise<void> {
    const pending = await this.recipientsRepository.countByCampaignAndStatus(
      campaign.id,
      'pending',
    );

    if (pending === 0) {
      await this.completeIfDone(campaign);
      return;
    }

    const nextWindow = computeNextDailyBatchWindowStart(campaign, now);
    const shouldUpdate =
      !campaign.nextSendEligibleAt ||
      campaign.nextSendEligibleAt.getTime() < nextWindow.getTime();

    if (shouldUpdate) {
      campaign.nextSendEligibleAt = nextWindow;
      await this.campaignsRepository.save(campaign);
    }
  }

  private async completeIfDone(
    campaign: WhatsappCampaignEntity,
  ): Promise<void> {
    const pending = await this.recipientsRepository.countByCampaignAndStatus(
      campaign.id,
      'pending',
    );

    if (pending === 0 && campaign.status === 'sending') {
      campaign.status = 'completed';
      await this.campaignsRepository.save(campaign);
    }
  }
}
