/** Sniff common WhatsApp media types from magic bytes when the gateway returns octet-stream. */
export function sniffMediaContentType(buffer: Buffer): string | null {
  if (buffer.length < 3) {
    return null;
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  if (buffer.length < 8) {
    return null;
  }

  const ftypAt4 =
    buffer.length >= 8 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70;
  const ftypAt0 =
    buffer[0] === 0x66 &&
    buffer[1] === 0x74 &&
    buffer[2] === 0x79 &&
    buffer[3] === 0x70;
  if (ftypAt4 || ftypAt0) {
    return 'video/mp4';
  }

  if (
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return 'audio/ogg';
  }

  return null;
}

export function normalizeWhatsappMediaPayload(payload: {
  buffer: Buffer;
  contentType: string;
}): { buffer: Buffer; contentType: string } {
  const { buffer } = payload;
  if (buffer.length === 0) {
    return payload;
  }

  const declared =
    payload.contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  const needsSniff =
    !declared ||
    declared === 'application/octet-stream' ||
    declared === 'binary/octet-stream';

  if (!needsSniff) {
    return payload;
  }

  const sniffed = sniffMediaContentType(buffer);
  if (!sniffed) {
    return payload;
  }

  return { buffer, contentType: sniffed };
}
