import {
  buildWhatsappMediaMetadata,
  buildWhatsappMediaMetadataFromWebhook,
  inferWhatsappMimetypeFromMessageType,
  mergeWhatsappMessageMediaMetadata,
  messageTypeSupportsMediaFetch,
  normalizeWhatsappWebhookMessageType,
  readCachedMediaFromMetadata,
  readInlineMediaFromMetadata,
  WHATSAPP_INBOX_CACHED_MEDIA_MAX_BYTES,
  WHATSAPP_INBOX_INLINE_MEDIA_MAX_BYTES,
} from './whatsapp-message-media-metadata.util';

describe('whatsapp-message-media-metadata.util', () => {
  it('round-trips inline base64 from metadata', () => {
    const data = Buffer.from('hello').toString('base64');
    const meta = buildWhatsappMediaMetadata({
      mimetype: 'image/jpeg',
      inlineBase64: data,
    });
    const read = readInlineMediaFromMetadata(meta);
    expect(read?.buffer.toString()).toBe('hello');
    expect(read?.contentType).toBe('image/jpeg');
  });

  it('rejects url pointers masquerading as data', () => {
    const meta = buildWhatsappMediaMetadata({
      mimetype: 'image/jpeg',
      inlineBase64: 'https://example.com/a.jpg',
    });
    expect(meta).toEqual({ mimetype: 'image/jpeg' });
    expect(readInlineMediaFromMetadata(meta)).toBeNull();
  });

  it('serves cached payloads above ingest cap but within serve cap', () => {
    const payload = Buffer.alloc(WHATSAPP_INBOX_INLINE_MEDIA_MAX_BYTES + 64, 1);
    const data = payload.toString('base64');
    const meta = {
      mimetype: 'image/jpeg',
      data,
      sizeBytes: payload.length,
    };
    expect(readInlineMediaFromMetadata(meta)).toBeNull();
    const cached = readCachedMediaFromMetadata(meta);
    expect(cached?.buffer.length).toBe(payload.length);
    expect(cached?.contentType).toBe('image/jpeg');
  });

  it('rejects cached payloads above serve cap', () => {
    const payload = Buffer.alloc(WHATSAPP_INBOX_CACHED_MEDIA_MAX_BYTES + 1, 1);
    const meta = {
      mimetype: 'image/jpeg',
      data: payload.toString('base64'),
    };
    expect(readCachedMediaFromMetadata(meta)).toBeNull();
  });
});

describe('inferWhatsappMimetypeFromMessageType', () => {
  it('maps common WhatsApp message types', () => {
    expect(inferWhatsappMimetypeFromMessageType('video')).toBe('video/mp4');
    expect(inferWhatsappMimetypeFromMessageType('sticker')).toBe('image/webp');
  });
});

describe('buildWhatsappMediaMetadataFromWebhook', () => {
  it('does not mark media-only webhooks as omitted when bytes are absent', () => {
    const meta = buildWhatsappMediaMetadataFromWebhook(
      { type: 'video' },
      null,
      null,
      'video',
    );
    expect(meta).toEqual({ mimetype: 'video/mp4' });
  });

  it('honors OpenWA omitted markers on webhooks', () => {
    const meta = buildWhatsappMediaMetadataFromWebhook(
      { type: 'video', media: { omitted: true, mimetype: 'video/mp4' } },
      null,
      'video/mp4',
      'video',
    );
    expect(meta).toEqual({ mimetype: 'video/mp4', omitted: true });
  });
});

describe('mergeWhatsappMessageMediaMetadata', () => {
  it('preserves cached base64 when a later webhook only has omitted metadata', () => {
    const existing = {
      mimetype: 'image/jpeg',
      data: Buffer.from('cached-bytes').toString('base64'),
      sizeBytes: 12,
    };
    const incoming = { mimetype: 'image/jpeg', omitted: true };
    expect(mergeWhatsappMessageMediaMetadata(existing, incoming)).toEqual({
      mimetype: 'image/jpeg',
      data: existing.data,
      sizeBytes: 12,
    });
  });

  it('prefers incoming bytes when the webhook carries inline data', () => {
    const existing = { mimetype: 'image/jpeg', omitted: true };
    const incoming = {
      mimetype: 'image/png',
      data: Buffer.from('new').toString('base64'),
      sizeBytes: 3,
    };
    expect(mergeWhatsappMessageMediaMetadata(existing, incoming)).toEqual(
      incoming,
    );
  });
});

describe('normalizeWhatsappWebhookMessageType', () => {
  it('maps unknown rows using mimetype or media payload', () => {
    expect(
      normalizeWhatsappWebhookMessageType('unknown', 'image/jpeg', false),
    ).toBe('image');
    expect(normalizeWhatsappWebhookMessageType('unknown', null, true)).toBe(
      'document',
    );
    expect(normalizeWhatsappWebhookMessageType('image', null, false)).toBe(
      'image',
    );
  });
});

describe('messageTypeSupportsMediaFetch', () => {
  it('allows common WhatsApp media types', () => {
    expect(messageTypeSupportsMediaFetch('image', null)).toBe(true);
    expect(messageTypeSupportsMediaFetch('audio', null)).toBe(true);
    expect(messageTypeSupportsMediaFetch('voice', null)).toBe(true);
    expect(messageTypeSupportsMediaFetch('document', 'application/pdf')).toBe(
      true,
    );
    expect(messageTypeSupportsMediaFetch('unknown', null)).toBe(true);
  });

  it('rejects plain chat rows', () => {
    expect(messageTypeSupportsMediaFetch('text', null)).toBe(false);
    expect(messageTypeSupportsMediaFetch('chat', null)).toBe(false);
  });
});
