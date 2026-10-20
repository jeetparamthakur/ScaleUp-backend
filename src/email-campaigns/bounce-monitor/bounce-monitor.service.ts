import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CredentialsCryptoService } from '../../common/crypto/credentials-crypto.service';
import {
  fetchOAuthGmailBounceEmails,
  fetchOAuthOutlookBounceEmails,
} from '../../mailboxes/mailbox-oauth-inbox.client';
import { MailboxOAuthTokenService } from '../../mailboxes/mailbox-oauth-token.service';
import { MailboxesRepository } from '../../mailboxes/mailboxes.repository';
import type { MailboxEntity } from '../../mailboxes/entities/mailbox.entity';
import type { MailboxCredentials } from '../../mailboxes/providers/mailbox-provider.types';
import {
  buildBounceReason,
  isDeliveryStatusNotification,
} from './bounce-parser.util';
import {
  canMonitorMailbox,
  fetchRecentBounceEmails,
} from './imap-mailbox.client';
import { EmailCampaignMessagesRepository } from '../email-campaign-messages.repository';
import { EmailCampaignRecipientsRepository } from '../email-campaign-recipients.repository';
import { EmailCampaignsRepository } from '../email-campaigns.repository';
import { EmailExcludedRepository } from '../email-excluded.repository';
import { CampaignEventService } from '../campaign-event.service';
import { CampaignMessageCorrelationService } from '../campaign-message-correlation.service';
import type { EmailCampaignMessageEntity } from '../entities/email-campaign-message.entity';

export interface BouncePollResult {
  mailboxesPolled: number;
  bouncesDetected: number;
  skipped: boolean;
}

const DEFAULT_BOUNCE_POLL_CRON = '*/2 * * * *';
const BOUNCE_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

@Injectable()
export class BounceMonitorService implements OnModuleInit {
  private readonly logger = new Logger(BounceMonitorService.name);
  private isRunning = false;

  constructor(
    private readonly mailboxesRepository: MailboxesRepository,
    private readonly emailCampaignsRepository: EmailCampaignsRepository,
    private readonly messagesRepository: EmailCampaignMessagesRepository,
    private readonly recipientsRepository: EmailCampaignRecipientsRepository,
    private readonly excludedRepository: EmailExcludedRepository,
    private readonly credentialsCrypto: CredentialsCryptoService,
    private readonly campaignEventService: CampaignEventService,
    private readonly correlationService: CampaignMessageCorrelationService,
    private readonly oauthTokenService: MailboxOAuthTokenService,
  ) {}

  onModuleInit(): void {
    setImmediate(() => {
      void this.healFalseBounces();
    });
  }

  @Cron(process.env.BOUNCE_POLL_INTERVAL_CRON ?? DEFAULT_BOUNCE_POLL_CRON)
  async pollAllMailboxes(): Promise<void> {
    await this.syncNow();
  }

  async syncNow(): Promise<BouncePollResult> {
    if (this.isRunning) {
      return { mailboxesPolled: 0, bouncesDetected: 0, skipped: true };
    }

    this.isRunning = true;

    try {
      await this.healFalseBounces();

      const mailboxes = await this.mailboxesRepository.findAllActive();
      const since = new Date(Date.now() - BOUNCE_LOOKBACK_MS);
      let mailboxesPolled = 0;
      let bouncesDetected = 0;

      for (const mailbox of mailboxes) {
        const detected = await this.pollMailbox(mailbox, since);
        if (detected >= 0) {
          mailboxesPolled += 1;
          bouncesDetected += detected;
        }
      }

      return { mailboxesPolled, bouncesDetected, skipped: false };
    } finally {
      this.isRunning = false;
    }
  }

  private async healFalseBounces(): Promise<void> {
    const messages =
      await this.messagesRepository.findEngagedButMarkedBounced();

    for (const message of messages) {
      const usedFallback =
        await this.campaignEventService.wasBounceMatchedByFallback(message.id);

      if (!usedFallback) {
        continue;
      }

      await this.messagesRepository.revertFalseBounce(message);

      const recipient = await this.recipientsRepository.findByIdAndCampaignId(
        message.recipientId,
        message.campaignId,
      );

      if (recipient?.status === 'failed') {
        recipient.status = 'active';
        await this.recipientsRepository.save(recipient);
      }

      const campaign = await this.emailCampaignsRepository.findById(
        message.campaignId,
      );

      if (campaign && recipient) {
        await this.excludedRepository.deleteByOrganizationIdAndEmail(
          campaign.organizationId,
          recipient.email,
        );
      }

      this.logger.warn(
        `Reverted false bounce for message ${message.id} — engagement proves delivery`,
      );
    }
  }

  private async pollMailbox(
    mailbox: MailboxEntity,
    since: Date,
  ): Promise<number> {
    let credentials: MailboxCredentials;

    try {
      credentials = this.credentialsCrypto.decrypt<MailboxCredentials>(
        mailbox.credentialsEncrypted,
      );
    } catch (error) {
      this.logger.warn(
        `Skipping bounce monitor for ${mailbox.email} — failed to decrypt credentials: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return -1;
    }

    if (!canMonitorMailbox(mailbox, credentials)) {
      return -1;
    }

    const bounceEmails = await this.fetchBounceEmails(
      mailbox,
      credentials,
      since,
    );

    let bouncesDetected = 0;

    for (const bounceEmail of bounceEmails) {
      const detected = await this.processBounceEmail(
        mailbox.id,
        mailbox.organizationId,
        bounceEmail,
        since,
      );
      if (detected) {
        bouncesDetected += 1;
      }
    }

    mailbox.lastSyncedAt = new Date();
    mailbox.syncStatus = 'connected';
    await this.mailboxesRepository.save(mailbox);

    return bouncesDetected;
  }

  private async fetchBounceEmails(
    mailbox: MailboxEntity,
    credentials: MailboxCredentials,
    since: Date,
  ): Promise<
    Array<{
      messageIds: string[];
      failedRecipientEmails: string[];
      subject: string;
      snippet: string;
      text: string;
    }>
  > {
    if (this.oauthTokenService.isOAuthCredentials(credentials)) {
      if (credentials.type === 'gmail') {
        const emails = await fetchOAuthGmailBounceEmails(
          mailbox,
          credentials,
          since,
          this.oauthTokenService,
          this.logger,
        );
        return emails.map((email) => ({
          from: email.from,
          subject: email.subject,
          messageIds: email.messageIds,
          failedRecipientEmails: email.failedRecipientEmails,
          snippet: email.snippet,
          text: email.text,
        }));
      }

      if (credentials.type === 'outlook') {
        const emails = await fetchOAuthOutlookBounceEmails(
          mailbox,
          credentials,
          since,
          this.oauthTokenService,
          this.logger,
        );
        return emails.map((email) => ({
          from: email.from,
          subject: email.subject,
          messageIds: email.messageIds,
          failedRecipientEmails: email.failedRecipientEmails,
          snippet: email.snippet,
          text: email.text,
        }));
      }

      return [];
    }

    const password = credentials.password;

    if (!password) {
      return [];
    }

    const emails = await fetchRecentBounceEmails(
      mailbox,
      password,
      since,
      this.logger,
    );

    return emails.map((email) => ({
      from: email.from,
      subject: email.subject,
      messageIds: email.messageIds,
      failedRecipientEmails: email.failedRecipientEmails,
      snippet: email.snippet,
      text: email.text,
    }));
  }

  private async processBounceEmail(
    mailboxId: string,
    organizationId: string,
    bounceEmail: {
      messageIds: string[];
      failedRecipientEmails: string[];
      subject: string;
      snippet: string;
      text: string;
    },
    since: Date,
  ): Promise<boolean> {
    if (!isDeliveryStatusNotification(bounceEmail.snippet)) {
      return false;
    }

    const reason = buildBounceReason({
      from: '',
      subject: bounceEmail.subject,
      messageIds: bounceEmail.messageIds,
      failedRecipientEmails: bounceEmail.failedRecipientEmails,
      snippet: bounceEmail.snippet,
      text: bounceEmail.text,
    });

    const failedRecipientEmail = bounceEmail.failedRecipientEmails[0];
    const match = await this.correlationService.matchBounceMessage({
      organizationId,
      mailboxId,
      rawText: bounceEmail.text,
      providerMessageIds: bounceEmail.messageIds,
      failedRecipientEmail,
      subject: bounceEmail.subject,
      since,
    });

    if (!match || match.message.deliveryStatus !== 'sent') {
      return false;
    }

    if (match.message.openCount > 0 || match.message.clickCount > 0) {
      this.logger.warn(
        `Skipping bounce for message ${match.message.id} — open/click engagement detected`,
      );
      return false;
    }

    if (
      match.method === 'imap_fallback' &&
      bounceEmail.failedRecipientEmails.length === 0
    ) {
      return false;
    }

    await this.applyBounce(match.message, reason, match.method);
    return true;
  }

  private async applyBounce(
    message: EmailCampaignMessageEntity,
    reason: string,
    correlationMethod: 'imap_token' | 'imap_message_id' | 'imap_fallback',
  ): Promise<void> {
    if (message.openCount > 0 || message.clickCount > 0) {
      return;
    }

    await this.campaignEventService.recordBounce(
      message,
      reason,
      'imap',
      new Date(),
      { correlationMethod },
    );

    const recipient = await this.recipientsRepository.findByIdAndCampaignId(
      message.recipientId,
      message.campaignId,
    );

    if (!recipient) {
      return;
    }

    recipient.status = 'failed';
    recipient.nextSendAt = null;
    await this.recipientsRepository.save(recipient);

    const campaign = await this.emailCampaignsRepository.findById(
      message.campaignId,
    );

    if (!campaign) {
      return;
    }

    await this.excludedRepository.upsertExcludedAddress({
      organizationId: campaign.organizationId,
      email: recipient.email,
      reason,
      sourceCampaignId: message.campaignId,
    });
  }
}
