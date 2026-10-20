import { capEmailSourceText } from '../../common/email/email-source.util';
import {
  isBounceSender,
  normalizeMessageId,
} from '../bounce-monitor/bounce-parser.util';

const IN_REPLY_TO_PATTERN = /^In-Reply-To:\s*(.+)$/im;
const REFERENCES_PATTERN = /^References:\s*(.+)$/im;
const MESSAGE_ID_HEADER_PATTERN = /<?([^\s>]+@[^\s>]+)>?/g;

export interface ParsedReplyEmail {
  from: string;
  subject: string;
  inReplyToMessageIds: string[];
  referenceMessageIds: string[];
  receivedAt: Date | null;
  text: string;
}

export function parseReplyEmail(input: {
  from: string;
  subject: string;
  text: string;
  receivedAt?: Date | null;
}): ParsedReplyEmail {
  const inReplyTo = input.text.match(IN_REPLY_TO_PATTERN)?.[1] ?? '';
  const references = input.text.match(REFERENCES_PATTERN)?.[1] ?? '';

  return {
    from: input.from,
    subject: input.subject,
    inReplyToMessageIds: extractMessageIds(inReplyTo),
    referenceMessageIds: extractMessageIds(references),
    receivedAt: input.receivedAt ?? null,
    text: capEmailSourceText(input.text),
  };
}

const REPLY_SUBJECT_PREFIX_PATTERN = /^(re|fwd|fw):\s*/i;

export function isReplyCandidate(
  from: string,
  subject: string,
  parsed: Pick<
    ParsedReplyEmail,
    'inReplyToMessageIds' | 'referenceMessageIds' | 'text'
  >,
  knownRecipientEmails?: ReadonlySet<string>,
): boolean {
  if (isBounceSender(from, subject)) {
    return false;
  }

  if (knownRecipientEmails?.has(from.trim().toLowerCase())) {
    return true;
  }

  const hasCorrelationHeaders =
    parsed.inReplyToMessageIds.length > 0 ||
    parsed.referenceMessageIds.length > 0 ||
    extractTrackingTokenFromReplyText(parsed.text) !== null;

  if (knownRecipientEmails && knownRecipientEmails.size > 0) {
    // Corporate gateways can rewrite the visible From header while keeping reply
    // correlation headers intact. Correlation still validates the match.
    return hasCorrelationHeaders;
  }

  if (hasCorrelationHeaders) {
    return true;
  }

  return REPLY_SUBJECT_PREFIX_PATTERN.test(subject.trim());
}

function extractTrackingTokenFromReplyText(text: string): string | null {
  const match = text.match(/markos-track:([0-9a-f-]{36})/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function extractMessageIds(headerValue: string): string[] {
  const ids = new Set<string>();

  for (const match of headerValue.matchAll(MESSAGE_ID_HEADER_PATTERN)) {
    if (match[1]) {
      ids.add(normalizeMessageId(match[1]));
    }
  }

  return [...ids];
}

export function getReplyCandidateMessageIds(
  parsed: ParsedReplyEmail,
): string[] {
  return [
    ...new Set([...parsed.inReplyToMessageIds, ...parsed.referenceMessageIds]),
  ];
}

const PLAIN_EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

export function extractSenderEmail(fromHeader: string): string {
  const trimmed = fromHeader.trim();
  const emailMatch = trimmed.match(/<([^>]+)>/);

  if (emailMatch?.[1]) {
    return emailMatch[1].toLowerCase();
  }

  const plainEmailMatch = trimmed.match(PLAIN_EMAIL_PATTERN);

  if (plainEmailMatch?.[0]) {
    return plainEmailMatch[0].toLowerCase();
  }

  return trimmed.toLowerCase();
}
