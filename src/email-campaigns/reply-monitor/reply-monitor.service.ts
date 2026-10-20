import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CredentialsCryptoService } from '../../common/crypto/credentials-crypto.service';
import {
  fetchOAuthGmailReplyEmails,
  fetchOAuthOutlookReplyEmails,
} from '../../mailboxes/mailbox-oauth-inbox.client';
import { MailboxOAuthTokenService } from '../../mailboxes/mailbox-oauth-token.service';
import { MailboxesRepository } from '../../mailboxes/mailboxes.repository';
import type { MailboxEntity } from '../../mailboxes/entities/mailbox.entity';
import type { MailboxCredentials } from '../../mailboxes/providers/mailbox-provider.types';
import { EmailCampaignMessagesRepository } from '../email-campaign-messages.repository';
import { EmailCampaignRecipientsRepository } from '../email-campaign-recipients.repository';
import { CampaignEventService } from '../campaign-event.service';
import { CampaignMessageCorrelationService } from '../campaign-message-correlation.service';
import { CampaignMessageMetadataBackfillService } from '../campaign-message-metadata-backfill.service';
import type { EmailCampaignMessageEntity } from '../entities/email-campaign-message.entity';
import type { EmailCampaignRecipientEntity } from '../entities/email-campaign-recipient.entity';
import { canMonitorMailbox, fetchRecentReplyEmails } from './imap-reply.client';
import {
  extractSenderEmail,
  getReplyCandidateMessageIds,
  type ParsedReplyEmail,
} from './reply-parser.util';

const DEFAULT_REPLY_POLL_CRON = '*/2 * * * *';
const REPLY_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;

export interface ReplyPollResult {
  mailboxesPolled: number;
  repliesDetected: number;
  opensInferred: number;
  skipped: boolean;
}

@Injectable()
export class ReplyMonitorService implements OnModuleInit {
  private readonly logger = new Logger(ReplyMonitorService.name);
  private isRunning = false;

  constructor(
    private readonly mailboxesRepository: MailboxesRepository,
    private readonly messagesRepository: EmailCampaignMessagesRepository,
    private readonly recipientsRepository: EmailCampaignRecipientsRepository,
    private readonly credentialsCrypto: CredentialsCryptoService,
    private readonly campaignEventService: CampaignEventService,
    private readonly correlationService: CampaignMessageCorrelationService,
    private readonly metadataBackfillService: CampaignMessageMetadataBackfillService,
    private readonly oauthTokenService: MailboxOAuthTokenService,
  ) {}

  onModuleInit(): void {
    setImmediate(() => {
      void this.backfillInferredOpens().catch((error: unknown) => {
        this.logger.warn(
          `Inferred open backfill skipped: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    });
  }

  @Cron(process.env.REPLY_POLL_INTERVAL_CRON ?? DEFAULT_REPLY_POLL_CRON)
  async pollAllMailboxes(): Promise<void> {
    await this.syncNow();
  }

  async syncNow(): Promise<ReplyPollResult> {
    if (this.isRunning) {
      const opensInferred = await this.backfillInferredOpens();
      return {
        mailboxesPolled: 0,
        repliesDetected: 0,
        opensInferred,
        skipped: true,
      };
    }

    this.isRunning = true;

    try {
      await this.metadataBackfillService.backfillIfNeeded();

      const mailboxes = await this.mailboxesRepository.findAllActive();
      const since = new Date(Date.now() - REPLY_LOOKBACK_MS);
      let mailboxesPolled = 0;
      let repliesDetected = 0;

      for (const mailbox of mailboxes) {
        const detected = await this.pollMailbox(mailbox, since);
        if (detected >= 0) {
          mailboxesPolled += 1;
          repliesDetected += detected;
        }
      }

      const opensInferred = await this.backfillInferredOpens();

      return {
        mailboxesPolled,
        repliesDetected,
        opensInferred,
        skipped: false,
      };
    } finally {
      this.isRunning = false;
    }
  }

  async backfillInferredOpens(): Promise<number> {
    const messages =
      await this.messagesRepository.findSentWithRepliedRecipientButNoOpen();
    const latestByRecipient = new Map<string, EmailCampaignMessageEntity>();

    for (const message of messages) {
      const existing = latestByRecipient.get(message.recipientId);

      if (
        !existing ||
        (message.sentAt && existing.sentAt && message.sentAt > existing.sentAt)
      ) {
        latestByRecipient.set(message.recipientId, message);
      }
    }

    let opensInferred = 0;

    for (const message of latestByRecipient.values()) {
      const recipient = message.recipient;

      if (!recipient?.repliedAt || message.openCount > 0) {
        continue;
      }

      await this.campaignEventService.recordOpen(message, recipient.repliedAt, {
        metadata: { source: 'inferred_from_reply' },
      });
      opensInferred += 1;
    }

    if (opensInferred > 0) {
      this.logger.log(
        `Backfilled ${opensInferred} inferred open(s) from replies`,
      );
    }

    return opensInferred;
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
        `Skipping reply monitor for ${mailbox.email} — failed to decrypt credentials: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return -1;
    }

    if (!canMonitorMailbox(mailbox, credentials)) {
      return -1;
    }

    const knownRecipientEmails = new Set(
      await this.messagesRepository.findDistinctRecipientEmailsSentSince(
        mailbox.organizationId,
        since,
        mailbox.id,
      ),
    );

    if (knownRecipientEmails.size > 0) {
      this.logger.log(
        `Polling ${mailbox.email} for replies from ${knownRecipientEmails.size} known recipient(s)`,
      );
    }

    const replyEmails = await this.fetchReplyEmails(
      mailbox,
      credentials,
      since,
      knownRecipientEmails,
    );

    if (replyEmails.length > 0) {
      const senderAddresses = [
        ...new Set(replyEmails.map((email) => extractSenderEmail(email.from))),
      ];
      this.logger.log(
        `Found ${replyEmails.length} reply candidate(s) in ${mailbox.email} from ${senderAddresses.slice(0, 8).join(', ')}${senderAddresses.length > 8 ? '…' : ''}`,
      );
    }

    let repliesDetected = 0;

    for (const replyEmail of replyEmails) {
      const detected = await this.processReplyEmail(
        mailbox.id,
        mailbox.organizationId,
        replyEmail,
        since,
      );
      if (detected) {
        repliesDetected += 1;
      }
    }

    mailbox.lastSyncedAt = new Date();
    mailbox.syncStatus = 'connected';
    await this.mailboxesRepository.save(mailbox);

    return repliesDetected;
  }

  private async fetchReplyEmails(
    mailbox: MailboxEntity,
    credentials: MailboxCredentials,
    since: Date,
    knownRecipientEmails: ReadonlySet<string>,
  ): Promise<ParsedReplyEmail[]> {
    if (this.oauthTokenService.isOAuthCredentials(credentials)) {
      if (credentials.type === 'gmail') {
        const emails = await fetchOAuthGmailReplyEmails(
          mailbox,
          credentials,
          since,
          this.oauthTokenService,
          this.logger,
          knownRecipientEmails,
        );
        return emails.map((email) => ({
          from: email.from,
          subject: email.subject,
          inReplyToMessageIds: email.inReplyToMessageIds,
          referenceMessageIds: email.referenceMessageIds,
          receivedAt: email.receivedAt,
          text: email.text,
        }));
      }

      if (credentials.type === 'outlook') {
        const emails = await fetchOAuthOutlookReplyEmails(
          mailbox,
          credentials,
          since,
          this.oauthTokenService,
          this.logger,
          knownRecipientEmails,
        );
        return emails.map((email) => ({
          from: email.from,
          subject: email.subject,
          inReplyToMessageIds: email.inReplyToMessageIds,
          referenceMessageIds: email.referenceMessageIds,
          receivedAt: email.receivedAt,
          text: email.text,
        }));
      }

      return [];
    }

    const password = credentials.password;

    if (!password) {
      return [];
    }

    const emails = await fetchRecentReplyEmails(
      mailbox,
      password,
      since,
      this.logger,
      knownRecipientEmails,
    );

    return emails.map((email) => ({
      from: email.from,
      subject: email.subject,
      inReplyToMessageIds: email.inReplyToMessageIds,
      referenceMessageIds: email.referenceMessageIds,
      receivedAt: email.receivedAt,
      text: email.text,
    }));
  }

  private async processReplyEmail(
    mailboxId: string,
    organizationId: string,
    replyEmail: ParsedReplyEmail,
    since: Date,
  ): Promise<boolean> {
    const senderEmail = extractSenderEmail(replyEmail.from);
    const match = await this.correlationService.matchReplyMessage({
      organizationId,
      mailboxId,
      rawText: replyEmail.text,
      providerMessageIds: getReplyCandidateMessageIds(replyEmail),
      senderEmail,
      subject: replyEmail.subject,
      since,
    });

    if (!match || match.message.deliveryStatus !== 'sent') {
      if (senderEmail) {
        this.logger.warn(
          `Reply from ${senderEmail} in mailbox ${mailboxId} could not be correlated (subject="${replyEmail.subject.trim()}")`,
        );
      }
      return false;
    }

    const recipient = await this.recipientsRepository.findByIdAndCampaignId(
      match.message.recipientId,
      match.message.campaignId,
    );

    if (!recipient || recipient.replyCategory || recipient.repliedAt) {
      return false;
    }

    return this.applyReply(recipient, match.message, replyEmail, match.method);
  }

  private async applyReply(
    recipient: EmailCampaignRecipientEntity,
    message: EmailCampaignMessageEntity,
    replyEmail: ParsedReplyEmail,
    correlationMethod: 'imap_token' | 'imap_message_id' | 'imap_fallback',
  ): Promise<boolean> {
    if (recipient.replyCategory || recipient.repliedAt) {
      return false;
    }

    const occurredAt = replyEmail.receivedAt ?? new Date();

    await this.campaignEventService.recordReply(
      recipient,
      message,
      occurredAt,
      {
        subject: replyEmail.subject,
        correlationMethod,
      },
    );

    if (message.openCount === 0) {
      await this.campaignEventService.recordOpen(message, occurredAt, {
        metadata: { source: 'inferred_from_reply' },
      });
    }

    this.logger.log(
      `Detected reply from ${recipient.email} for campaign ${message.campaignId}`,
    );

    return true;
  }
}
