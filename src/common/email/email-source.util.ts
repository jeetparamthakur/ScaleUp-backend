/** Cap kept so inbox polling never materializes full MIME attachments in heap. */
export const MAX_EMAIL_SOURCE_CHARS = 64_000;

export const IMAP_SOURCE_FETCH = {
  start: 0,
  maxLength: MAX_EMAIL_SOURCE_CHARS,
} as const;

export function capEmailSourceText(text: string): string {
  if (text.length <= MAX_EMAIL_SOURCE_CHARS) {
    return text;
  }

  return text.slice(0, MAX_EMAIL_SOURCE_CHARS);
}

export function decodeBase64UrlCapped(value: string): string {
  const maxB64Chars = Math.floor((MAX_EMAIL_SOURCE_CHARS / 3) * 4);
  const alignedLength = maxB64Chars - (maxB64Chars % 4);
  const truncated =
    value.length > alignedLength ? value.slice(0, alignedLength) : value;
  const normalized = truncated.replace(/-/g, '+').replace(/_/g, '/');
  const padding =
    normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));

  return Buffer.from(normalized + padding, 'base64').toString('utf8');
}

export function buildGmailRecipientSearchQueries(
  since: Date,
  knownRecipientEmails?: ReadonlySet<string>,
): string[] {
  const afterSeconds = Math.floor(since.getTime() / 1000);
  const recipients = [...(knownRecipientEmails ?? [])];

  if (recipients.length === 0) {
    return [`after:${afterSeconds}`];
  }

  const queries: string[] = [];
  const batchSize = 8;

  for (let index = 0; index < recipients.length; index += batchSize) {
    const batch = recipients.slice(index, index + batchSize);
    const fromClause = batch
      .map((email) => `from:"${email.replace(/"/g, '')}"`)
      .join(' OR ');
    queries.push(`(${fromClause}) after:${afterSeconds}`);
  }

  return queries;
}
