import { Logger } from '@nestjs/common';
import { IMAP_SOURCE_FETCH } from '../../common/email/email-source.util';
import type { ImapFlow } from 'imapflow';
import type { MailboxEntity } from '../../mailboxes/entities/mailbox.entity';
import {
  getReplyMonitorMailboxes,
  resolveImapPreset,
} from '../bounce-monitor/imap-presets';
import {
  canMonitorMailbox,
  createImapFlowClient,
} from '../bounce-monitor/imap-mailbox.client';
import {
  extractSenderEmail,
  isReplyCandidate,
  parseReplyEmail,
} from './reply-parser.util';
import type { ParsedReplyEmail } from './reply-parser.util';

export interface FetchedReplyEmail extends ParsedReplyEmail {
  uid: number;
}

export { canMonitorMailbox };

const MESSAGE_ID_HEADER_PATTERN = /^Message-ID:\s*(.+)$/im;
const MAX_MESSAGES_PER_FOLDER = 80;
const MAX_PER_SENDER_SEARCHES = 20;

function extractMessageIdFromSource(text: string): string | null {
  const match = text.match(MESSAGE_ID_HEADER_PATTERN);
  return match?.[1]?.trim().toLowerCase() ?? null;
}

async function fetchReplyEmailsFromFolder(
  client: ImapFlow,
  folder: string,
  since: Date,
  seenMessageIds: Set<string>,
  results: FetchedReplyEmail[],
  knownRecipientEmails?: ReadonlySet<string>,
): Promise<void> {
  let lock;

  try {
    lock = await client.getMailboxLock(folder);
  } catch {
    return;
  }

  try {
    const uidSet = new Set<number>();
    const searchCriteriaList: Array<Record<string, unknown>> =
      knownRecipientEmails &&
      knownRecipientEmails.size > 0 &&
      knownRecipientEmails.size <= MAX_PER_SENDER_SEARCHES
        ? [...knownRecipientEmails].map((email) => ({ since, from: email }))
        : [{ since }];

    for (const criteria of searchCriteriaList) {
      const uidList = await client.search(criteria);
      const uids = Array.isArray(uidList) ? uidList : [];

      for (const uid of uids) {
        uidSet.add(uid);
      }
    }

    const uids = [...uidSet].sort((left, right) => left - right);

    for (const uid of uids.slice(-MAX_MESSAGES_PER_FOLDER)) {
      const message = await client.fetchOne(
        uid,
        { envelope: true, source: IMAP_SOURCE_FETCH },
        { uid: true },
      );

      if (!message || !message.envelope || !message.source) {
        continue;
      }

      const text = message.source.toString('utf8');
      const messageId = extractMessageIdFromSource(text);

      if (messageId) {
        if (seenMessageIds.has(messageId)) {
          continue;
        }

        seenMessageIds.add(messageId);
      }

      const fromHeader = text.match(/^From:\s*(.+)$/im)?.[1]?.trim() ?? '';
      const envelopeFrom = message.envelope.from?.[0]?.address?.trim() ?? '';
      const from =
        extractSenderEmail(fromHeader) || extractSenderEmail(envelopeFrom);
      const subject = message.envelope.subject ?? '';
      const receivedAt = message.envelope.date ?? null;
      const parsed = parseReplyEmail({ from, subject, text, receivedAt });

      if (!isReplyCandidate(from, subject, parsed, knownRecipientEmails)) {
        continue;
      }

      results.push({
        uid,
        ...parsed,
      });
    }
  } finally {
    lock.release();
  }
}

export async function fetchRecentReplyEmails(
  mailbox: MailboxEntity,
  password: string,
  since: Date,
  logger: Logger,
  knownRecipientEmails?: ReadonlySet<string>,
): Promise<FetchedReplyEmail[]> {
  const preset = resolveImapPreset(mailbox.provider, mailbox.smtpHost);

  if (!preset || !mailbox.smtpUser) {
    return [];
  }

  const client = await createImapFlowClient(
    {
      host: preset.host,
      port: preset.port,
      secure: preset.secure,
      auth: {
        user: mailbox.smtpUser,
        pass: password,
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      logger: false,
    },
    logger,
    'reply fetch',
    mailbox.email,
  );

  const results: FetchedReplyEmail[] = [];
  const seenMessageIds = new Set<string>();
  const folders = getReplyMonitorMailboxes(mailbox.provider, preset);

  try {
    await client.connect();

    for (const folder of folders) {
      await fetchReplyEmailsFromFolder(
        client,
        folder,
        since,
        seenMessageIds,
        results,
        knownRecipientEmails,
      );
    }
  } catch (error) {
    logger.warn(
      `IMAP reply fetch failed for mailbox ${mailbox.email}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  } finally {
    await client.logout().catch(() => undefined);
  }

  return results;
}
