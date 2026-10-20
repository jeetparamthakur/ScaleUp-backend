import { capEmailSourceText } from '../../common/email/email-source.util';

const BOUNCE_SENDER_PATTERNS = [
  /mailer-daemon/i,
  /postmaster/i,
  /mail delivery subsystem/i,
  /delivery status notification/i,
];

const MESSAGE_ID_PATTERN = /Message-ID:\s*<?([^\s>]+@[^\s>]+)>?/gi;
const FINAL_RECIPIENT_PATTERN = /Final-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i;
const ORIGINAL_RECIPIENT_PATTERN =
  /Original-Recipient:\s*rfc822;\s*([^\s\r\n]+)/i;
const FAILED_RECIPIENT_PATTERN =
  /(?:failed|invalid|unknown|undeliverable)[^\n]*?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i;
const ACTION_FAILED_PATTERN = /Action:\s*failed/i;

export interface ParsedBounceEmail {
  from: string;
  subject: string;
  messageIds: string[];
  failedRecipientEmails: string[];
  snippet: string;
  text: string;
}

export function isBounceSender(from: string, subject: string): boolean {
  const combined = `${from} ${subject}`;

  return BOUNCE_SENDER_PATTERNS.some((pattern) => pattern.test(combined));
}

export function parseBounceEmail(input: {
  from: string;
  subject: string;
  text: string;
}): ParsedBounceEmail {
  const body = input.text;
  const messageIds = new Set<string>();

  for (const match of body.matchAll(MESSAGE_ID_PATTERN)) {
    if (match[1]) {
      messageIds.add(normalizeMessageId(match[1]));
    }
  }

  const failedRecipientEmails = new Set<string>();
  const finalRecipient = body.match(FINAL_RECIPIENT_PATTERN);

  if (finalRecipient?.[1]) {
    failedRecipientEmails.add(finalRecipient[1].toLowerCase());
  }

  const originalRecipient = body.match(ORIGINAL_RECIPIENT_PATTERN);
  if (originalRecipient?.[1]) {
    failedRecipientEmails.add(originalRecipient[1].toLowerCase());
  }

  const failedMatch = body.match(FAILED_RECIPIENT_PATTERN);
  if (failedMatch?.[1]) {
    failedRecipientEmails.add(failedMatch[1].toLowerCase());
  }

  return {
    from: input.from,
    subject: input.subject,
    messageIds: [...messageIds],
    failedRecipientEmails: [...failedRecipientEmails].slice(0, 5),
    snippet: body.slice(0, 500),
    text: capEmailSourceText(body),
  };
}

export function normalizeMessageId(messageId: string): string {
  return messageId.trim().replace(/^<|>$/g, '').toLowerCase();
}

export function buildBounceReason(parsed: ParsedBounceEmail): string {
  const subject = parsed.subject.trim();
  return subject.length > 0 ? subject : 'Delivery failed';
}

export function isDeliveryStatusNotification(text: string): boolean {
  return (
    ACTION_FAILED_PATTERN.test(text) ||
    FINAL_RECIPIENT_PATTERN.test(text) ||
    ORIGINAL_RECIPIENT_PATTERN.test(text)
  );
}
