import { Logger } from '@nestjs/common';
import {
  buildGmailRecipientSearchQueries,
  capEmailSourceText,
  decodeBase64UrlCapped,
} from '../common/email/email-source.util';
import {
  isBounceSender,
  parseBounceEmail,
} from '../email-campaigns/bounce-monitor/bounce-parser.util';
import type { ParsedBounceEmail } from '../email-campaigns/bounce-monitor/bounce-parser.util';
import {
  extractSenderEmail,
  isReplyCandidate,
  parseReplyEmail,
} from '../email-campaigns/reply-monitor/reply-parser.util';
import type { ParsedReplyEmail } from '../email-campaigns/reply-monitor/reply-parser.util';
import type { MailboxEntity } from './entities/mailbox.entity';
import type {
  GmailCredentials,
  OutlookCredentials,
} from './providers/mailbox-provider.types';
import { MailboxOAuthTokenService } from './mailbox-oauth-token.service';

export interface FetchedOAuthBounceEmail extends ParsedBounceEmail {
  id: string;
}

export interface FetchedOAuthReplyEmail extends ParsedReplyEmail {
  id: string;
}

function extractHeadersFromRawEmail(raw: string): {
  from: string;
  subject: string;
} {
  const fromHeader = raw.match(/^From:\s*(.+)$/im)?.[1]?.trim() ?? '';
  const subject = raw.match(/^Subject:\s*(.+)$/im)?.[1]?.trim() ?? '';
  return { from: fromHeader, subject };
}

async function fetchGmailReplyMessagesForQuery(
  accessToken: string,
  query: string,
  knownRecipientEmails: ReadonlySet<string> | undefined,
  seenMessageIds: Set<string>,
  results: FetchedOAuthReplyEmail[],
  maxListedMessages: number,
  listedCount: { value: number },
): Promise<void> {
  let pageToken: string | undefined;

  while (listedCount.value < maxListedMessages) {
    const pageSize = Math.min(100, maxListedMessages - listedCount.value);
    const listUrl = new URL(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages',
    );
    listUrl.searchParams.set('q', query);
    listUrl.searchParams.set('maxResults', String(pageSize));

    if (pageToken) {
      listUrl.searchParams.set('pageToken', pageToken);
    }

    const listResponse = await fetch(listUrl.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!listResponse.ok) {
      throw new Error(`HTTP ${listResponse.status}`);
    }

    const listPayload = (await listResponse.json()) as {
      messages?: Array<{ id: string }>;
      nextPageToken?: string;
    };

    const messageIds = listPayload.messages ?? [];
    listedCount.value += messageIds.length;

    for (const item of messageIds) {
      const messageResponse = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=raw`,
        { headers: { authorization: `Bearer ${accessToken}` } },
      );

      if (!messageResponse.ok) {
        continue;
      }

      const messagePayload = (await messageResponse.json()) as {
        raw?: string;
      };

      if (!messagePayload.raw) {
        continue;
      }

      const text = decodeBase64UrlCapped(messagePayload.raw);
      const messageId =
        text
          .match(/^Message-ID:\s*(.+)$/im)?.[1]
          ?.trim()
          .toLowerCase() ?? null;

      if (messageId) {
        if (seenMessageIds.has(messageId)) {
          continue;
        }

        seenMessageIds.add(messageId);
      }

      const { from: fromHeader, subject } = extractHeadersFromRawEmail(text);
      const from = extractSenderEmail(fromHeader);
      const receivedAtMatch = text.match(/^Date:\s*(.+)$/im)?.[1]?.trim();
      const receivedAt = receivedAtMatch ? new Date(receivedAtMatch) : null;
      const parsed = parseReplyEmail({ from, subject, text, receivedAt });

      if (!isReplyCandidate(from, subject, parsed, knownRecipientEmails)) {
        continue;
      }

      results.push({
        id: item.id,
        ...parsed,
      });
    }

    pageToken = listPayload.nextPageToken;

    if (!pageToken || messageIds.length === 0) {
      break;
    }
  }
}

export async function fetchOAuthGmailBounceEmails(
  mailbox: MailboxEntity,
  credentials: GmailCredentials,
  since: Date,
  oauthTokenService: MailboxOAuthTokenService,
  logger: Logger,
): Promise<FetchedOAuthBounceEmail[]> {
  const accessToken = await oauthTokenService.getFreshAccessToken(
    mailbox,
    credentials,
  );
  const afterSeconds = Math.floor(since.getTime() / 1000);
  const query = encodeURIComponent(
    `(from:mailer-daemon OR from:postmaster) after:${afterSeconds}`,
  );

  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  if (!listResponse.ok) {
    logger.warn(
      `Gmail API bounce list failed for ${mailbox.email}: HTTP ${listResponse.status}`,
    );
    return [];
  }

  const listPayload = (await listResponse.json()) as {
    messages?: Array<{ id: string }>;
  };

  const results: FetchedOAuthBounceEmail[] = [];

  for (const item of listPayload.messages ?? []) {
    const messageResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}?format=raw`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );

    if (!messageResponse.ok) {
      continue;
    }

    const messagePayload = (await messageResponse.json()) as {
      raw?: string;
    };

    if (!messagePayload.raw) {
      continue;
    }

    const text = decodeBase64UrlCapped(messagePayload.raw);
    const { from, subject } = extractHeadersFromRawEmail(text);

    if (!isBounceSender(from, subject)) {
      continue;
    }

    results.push({
      id: item.id,
      ...parseBounceEmail({ from, subject, text }),
    });
  }

  return results;
}

export async function fetchOAuthOutlookBounceEmails(
  mailbox: MailboxEntity,
  credentials: OutlookCredentials,
  since: Date,
  oauthTokenService: MailboxOAuthTokenService,
  logger: Logger,
): Promise<FetchedOAuthBounceEmail[]> {
  const accessToken = await oauthTokenService.getFreshAccessToken(
    mailbox,
    credentials,
  );
  const sinceIso = since.toISOString();
  const filter = encodeURIComponent(
    `receivedDateTime ge ${sinceIso} and (contains(from/emailAddress/address,'mailer-daemon') or contains(from/emailAddress/address,'postmaster'))`,
  );

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$filter=${filter}&$top=50&$select=id,from,subject,body,receivedDateTime`,
    { headers: { authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    logger.warn(
      `Microsoft Graph bounce list failed for ${mailbox.email}: HTTP ${response.status}`,
    );
    return [];
  }

  const payload = (await response.json()) as {
    value?: Array<{
      id: string;
      from?: { emailAddress?: { address?: string } };
      subject?: string;
      body?: { content?: string };
    }>;
  };

  const results: FetchedOAuthBounceEmail[] = [];

  for (const message of payload.value ?? []) {
    const from = message.from?.emailAddress?.address ?? '';
    const subject = message.subject ?? '';
    const text = capEmailSourceText(message.body?.content ?? '');

    if (!isBounceSender(from, subject)) {
      continue;
    }

    results.push({
      id: message.id,
      ...parseBounceEmail({ from, subject, text }),
    });
  }

  return results;
}

export async function fetchOAuthGmailReplyEmails(
  mailbox: MailboxEntity,
  credentials: GmailCredentials,
  since: Date,
  oauthTokenService: MailboxOAuthTokenService,
  logger: Logger,
  knownRecipientEmails?: ReadonlySet<string>,
): Promise<FetchedOAuthReplyEmail[]> {
  const accessToken = await oauthTokenService.getFreshAccessToken(
    mailbox,
    credentials,
  );
  const queries = buildGmailRecipientSearchQueries(since, knownRecipientEmails);
  const results: FetchedOAuthReplyEmail[] = [];
  const seenMessageIds = new Set<string>();
  const listedCount = { value: 0 };
  const maxListedMessages = 80;

  for (const query of queries) {
    try {
      await fetchGmailReplyMessagesForQuery(
        accessToken,
        query,
        knownRecipientEmails,
        seenMessageIds,
        results,
        maxListedMessages,
        listedCount,
      );
    } catch (error) {
      logger.warn(
        `Gmail API reply list failed for ${mailbox.email}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      return results;
    }

    if (listedCount.value >= maxListedMessages) {
      break;
    }
  }

  return results;
}

export async function fetchOAuthOutlookReplyEmails(
  mailbox: MailboxEntity,
  credentials: OutlookCredentials,
  since: Date,
  oauthTokenService: MailboxOAuthTokenService,
  logger: Logger,
  knownRecipientEmails?: ReadonlySet<string>,
): Promise<FetchedOAuthReplyEmail[]> {
  const accessToken = await oauthTokenService.getFreshAccessToken(
    mailbox,
    credentials,
  );
  const sinceIso = since.toISOString();
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const folders = ['inbox', 'sentitems'];

  const results: FetchedOAuthReplyEmail[] = [];
  const seenMessageIds = new Set<string>();

  for (const folder of folders) {
    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$filter=${filter}&$top=100&$select=id,from,subject,body,receivedDateTime,internetMessageId`,
      { headers: { authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      logger.warn(
        `Microsoft Graph reply list failed for ${mailbox.email}/${folder}: HTTP ${response.status}`,
      );
      continue;
    }

    const payload = (await response.json()) as {
      value?: Array<{
        id: string;
        internetMessageId?: string;
        from?: { emailAddress?: { address?: string } };
        subject?: string;
        body?: { content?: string };
        receivedDateTime?: string;
      }>;
    };

    for (const message of payload.value ?? []) {
      const messageId = message.internetMessageId?.trim().toLowerCase();

      if (messageId) {
        if (seenMessageIds.has(messageId)) {
          continue;
        }

        seenMessageIds.add(messageId);
      }

      const from = extractSenderEmail(
        message.from?.emailAddress?.address ?? '',
      );
      const subject = message.subject ?? '';
      const text = capEmailSourceText(message.body?.content ?? '');
      const receivedAt = message.receivedDateTime
        ? new Date(message.receivedDateTime)
        : null;
      const parsed = parseReplyEmail({ from, subject, text, receivedAt });

      if (!isReplyCandidate(from, subject, parsed, knownRecipientEmails)) {
        continue;
      }

      results.push({
        id: message.id,
        ...parsed,
      });
    }
  }

  return results;
}
