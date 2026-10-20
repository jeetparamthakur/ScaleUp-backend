import {
  MAX_EMAIL_SOURCE_CHARS,
  buildGmailRecipientSearchQueries,
  capEmailSourceText,
  decodeBase64UrlCapped,
} from './email-source.util';

describe('email-source.util', () => {
  it('caps stored email text to the configured limit', () => {
    const text = 'a'.repeat(MAX_EMAIL_SOURCE_CHARS + 250);

    expect(capEmailSourceText(text)).toHaveLength(MAX_EMAIL_SOURCE_CHARS);
  });

  it('decodes only a prefix of oversized base64url payloads', () => {
    const oversized = Buffer.alloc(MAX_EMAIL_SOURCE_CHARS * 4, 65).toString(
      'base64url',
    );

    const decoded = decodeBase64UrlCapped(oversized);

    expect(decoded.length).toBeLessThanOrEqual(MAX_EMAIL_SOURCE_CHARS + 3);
  });

  it('batches Gmail from: queries instead of one query per recipient', () => {
    const since = new Date('2026-01-01T00:00:00.000Z');
    const queries = buildGmailRecipientSearchQueries(
      since,
      new Set(['a@example.com', 'b@example.com', 'c@example.com']),
    );

    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('from:"a@example.com"');
    expect(queries[0]).toContain('OR');
    expect(queries[0]).toContain('after:');
  });
});
