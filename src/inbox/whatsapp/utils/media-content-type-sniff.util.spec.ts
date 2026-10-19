import {
  normalizeWhatsappMediaPayload,
  sniffMediaContentType,
} from './media-content-type-sniff.util';

describe('sniffMediaContentType', () => {
  it('detects JPEG', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(sniffMediaContentType(buf)).toBe('image/jpeg');
  });

  it('detects PNG', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffMediaContentType(buf)).toBe('image/png');
  });

  it('detects WebP', () => {
    const buf = Buffer.alloc(12);
    buf.write('RIFF', 0);
    buf.write('WEBP', 8);
    expect(sniffMediaContentType(buf)).toBe('image/webp');
  });
});

describe('normalizeWhatsappMediaPayload', () => {
  it('replaces octet-stream with sniffed type', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const result = normalizeWhatsappMediaPayload({
      buffer,
      contentType: 'application/octet-stream',
    });
    expect(result.contentType).toBe('image/jpeg');
  });

  it('keeps a declared image type', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff]);
    const result = normalizeWhatsappMediaPayload({
      buffer,
      contentType: 'image/jpeg',
    });
    expect(result.contentType).toBe('image/jpeg');
  });
});
