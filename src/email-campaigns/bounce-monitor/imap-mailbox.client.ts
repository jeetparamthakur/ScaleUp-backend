import { Logger } from '@nestjs/common';
import type { ImapFlow } from 'imapflow';
import type { MailboxEntity } from '../../mailboxes/entities/mailbox.entity';
import type { MailboxCredentials } from '../../mailboxes/providers/mailbox-provider.types';
import { IMAP_SOURCE_FETCH } from '../../common/email/email-source.util';
import { resolveImapPreset } from './imap-presets';
import { isBounceSender, parseBounceEmail } from './bounce-parser.util';
import type { ParsedBounceEmail } from './bounce-parser.util';

export interface FetchedBounceEmail extends ParsedBounceEmail {
  uid: number;
}

type ImapFlowOptions = ConstructorParameters<
  typeof import('imapflow').ImapFlow
>[0];

export async function createImapFlowClient(
  options: ImapFlowOptions,
  logger: Logger,
  context: string,
  mailboxEmail: string,
): Promise<ImapFlow> {
  const { ImapFlow } = await import('imapflow');
  const client = new ImapFlow(options);

  client.on('error', (error) => {
    logger.warn(
      `IMAP ${context} connection error for ${mailboxEmail}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  });

  return client;
}

export async function fetchRecentBounceEmails(
  mailbox: MailboxEntity,
  password: string,
  since: Date,
  logger: Logger,
): Promise<FetchedBounceEmail[]> {
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
    'bounce fetch',
    mailbox.email,
  );

  const results: FetchedBounceEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');

    try {
      const uidSets = await Promise.all([
        client.search({ since, from: 'mailer-daemon' }),
        client.search({ since, from: 'postmaster' }),
      ]);

      const uidList = [
        ...new Set(
          uidSets.flatMap((uids) => (Array.isArray(uids) ? uids : [])),
        ),
      ];

      for (const uid of uidList.slice(-80)) {
        const message = await client.fetchOne(
          uid,
          { envelope: true, source: IMAP_SOURCE_FETCH },
          { uid: true },
        );

        if (!message || !message.envelope || !message.source) {
          continue;
        }

        const text = message.source.toString('utf8');
        const fromHeader = text.match(/^From:\s*(.+)$/im)?.[1]?.trim() ?? '';
        const from = fromHeader.replace(/^.*<([^>]+)>.*$/, '$1') || fromHeader;
        const subject = message.envelope.subject ?? '';

        if (!isBounceSender(from, subject)) {
          continue;
        }

        results.push({
          uid,
          ...parseBounceEmail({ from, subject, text }),
        });
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    logger.warn(
      `IMAP bounce fetch failed for mailbox ${mailbox.email}: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  } finally {
    await client.logout().catch(() => undefined);
  }

  return results;
}

export function canMonitorMailbox(
  mailbox: MailboxEntity,
  credentials: MailboxCredentials,
): boolean {
  if (mailbox.status !== 'active') {
    return false;
  }

  if (
    (credentials.type === 'gmail' || credentials.type === 'outlook') &&
    credentials.authMethod === 'oauth'
  ) {
    return Boolean(credentials.refreshToken?.trim());
  }

  return resolveImapPreset(mailbox.provider, mailbox.smtpHost) !== null;
}
