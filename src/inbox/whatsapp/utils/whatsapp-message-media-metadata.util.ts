export const WHATSAPP_INBOX_INLINE_MEDIA_MAX_BYTES = 1024 * 1024;

/** Max decoded bytes when serving media already stored on the message row (OpenWA fetch cache). */
export const WHATSAPP_INBOX_CACHED_MEDIA_MAX_BYTES = 64 * 1024 * 1024;

const MEDIA_URL_POINTER = /^https?:\/\//i;

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!source) {
    return null;
  }
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function safeBase64WithinCap(
  data: string,
  maxDecodedBytes: number,
): string | null {
  if (!data || MEDIA_URL_POINTER.test(data)) {
    return null;
  }
  try {
    const bytes = Buffer.from(data, 'base64');
    if (bytes.length === 0 || bytes.length > maxDecodedBytes) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function safeInlineBase64(data: string): string | null {
  return safeBase64WithinCap(data, WHATSAPP_INBOX_INLINE_MEDIA_MAX_BYTES);
}

function readMediaFromMetadataWithCap(
  metadata: Record<string, unknown> | null | undefined,
  maxDecodedBytes: number,
): { buffer: Buffer; contentType: string } | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const data = metadata.data;
  const mimetype = metadata.mimetype;
  if (
    typeof data !== 'string' ||
    typeof mimetype !== 'string' ||
    !mimetype.trim()
  ) {
    return null;
  }
  const inline = safeBase64WithinCap(data, maxDecodedBytes);
  if (!inline) {
    return null;
  }
  return {
    buffer: Buffer.from(inline, 'base64'),
    contentType: mimetype.split(';')[0]?.trim() || 'application/octet-stream',
  };
}

export function readInlineMediaFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { buffer: Buffer; contentType: string } | null {
  return readMediaFromMetadataWithCap(
    metadata,
    WHATSAPP_INBOX_INLINE_MEDIA_MAX_BYTES,
  );
}

export function readCachedMediaFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): { buffer: Buffer; contentType: string } | null {
  return readMediaFromMetadataWithCap(
    metadata,
    WHATSAPP_INBOX_CACHED_MEDIA_MAX_BYTES,
  );
}

/** OpenWA / wwebjs sometimes emit `unknown` for media rows; infer a stable type when possible. */
export function normalizeWhatsappWebhookMessageType(
  type: string,
  mimetype: string | null | undefined,
  hasMediaPayload: boolean,
): string {
  const normalized = type.trim().toLowerCase() || 'text';
  if (normalized !== 'unknown') {
    return normalized;
  }
  const mime = mimetype?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) {
    return 'image';
  }
  if (mime.startsWith('video/')) {
    return 'video';
  }
  if (mime.startsWith('audio/')) {
    return 'audio';
  }
  if (mime) {
    return 'document';
  }
  if (hasMediaPayload) {
    return 'document';
  }
  return 'unknown';
}

export function inferWhatsappMimetypeFromMessageType(
  messageType: string | null | undefined,
): string | null {
  const type = messageType?.toLowerCase() ?? '';
  if (type === 'unknown') {
    return 'application/octet-stream';
  }
  if (type === 'image') {
    return 'image/jpeg';
  }
  if (type === 'sticker') {
    return 'image/webp';
  }
  if (type === 'gif') {
    return 'image/gif';
  }
  if (type === 'video') {
    return 'video/mp4';
  }
  if (type === 'audio' || type === 'ptt' || type === 'voice') {
    return 'audio/ogg';
  }
  if (type === 'document') {
    return 'application/octet-stream';
  }
  return null;
}

export function messageTypeSupportsMediaFetch(
  messageType: string | null | undefined,
  mimetype: string | null | undefined,
): boolean {
  const type = messageType?.toLowerCase() ?? 'text';
  const mime = mimetype?.toLowerCase() ?? '';
  if (type === 'text' || type === 'chat' || type === 'e2e_notification') {
    return false;
  }
  if (
    type === 'image' ||
    type === 'sticker' ||
    type === 'gif' ||
    type === 'video' ||
    type === 'audio' ||
    type === 'ptt' ||
    type === 'voice' ||
    type === 'document' ||
    type === 'unknown'
  ) {
    return true;
  }
  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime.startsWith('audio/') ||
    mime.startsWith('application/')
  );
}

export function buildWhatsappMediaMetadata(input: {
  filename?: string | null;
  mimetype?: string | null;
  inlineBase64?: string | null;
  omitted?: boolean;
}): Record<string, unknown> | null {
  const meta: Record<string, unknown> = {};
  if (input.filename) {
    meta.filename = input.filename;
  }
  if (input.mimetype) {
    meta.mimetype = input.mimetype;
  }
  if (input.omitted) {
    meta.omitted = true;
  }
  const inline =
    input.inlineBase64 && !input.omitted
      ? safeInlineBase64(input.inlineBase64)
      : null;
  if (inline) {
    meta.data = inline;
    meta.sizeBytes = Buffer.byteLength(inline, 'base64');
  }
  if (Object.keys(meta).length === 0) {
    return null;
  }
  return meta;
}

function hasUsableInlineMediaData(data: unknown): data is string {
  return (
    typeof data === 'string' && data.length > 0 && !MEDIA_URL_POINTER.test(data)
  );
}

/**
 * Merge webhook/history metadata without dropping bytes already cached on the row.
 */
export function mergeWhatsappMessageMediaMetadata(
  existing: Record<string, unknown> | null | undefined,
  incoming: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!incoming) {
    return existing ?? null;
  }
  if (!existing) {
    return incoming;
  }

  const merged: Record<string, unknown> = { ...existing, ...incoming };
  const incomingHasData = hasUsableInlineMediaData(incoming.data);
  const existingHasData = hasUsableInlineMediaData(existing.data);

  if (incomingHasData && merged.omitted === true) {
    delete merged.omitted;
  }

  if (!incomingHasData && existingHasData) {
    merged.data = existing.data;
    if (typeof existing.sizeBytes === 'number') {
      merged.sizeBytes = existing.sizeBytes;
    }
    if (merged.omitted === true) {
      delete merged.omitted;
    }
  }

  return Object.keys(merged).length > 0 ? merged : null;
}

export function stripInlineMediaDataForApi(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== 'object') {
    return metadata ?? null;
  }
  const rest = { ...metadata };
  delete rest.data;
  delete rest.omitted;
  delete rest.mediaUnavailableConfirmed;
  return Object.keys(rest).length > 0 ? rest : null;
}

export function buildWhatsappMediaMetadataFromWebhook(
  payload: Record<string, unknown>,
  filename: string | null,
  mimetype: string | null,
  messageType?: string | null,
): Record<string, unknown> | null {
  const mediaPayload =
    payload.media && typeof payload.media === 'object'
      ? (payload.media as Record<string, unknown>)
      : null;
  const inlineBase64 =
    readString(mediaPayload, 'data') ?? readString(payload, 'data');
  const omitted = mediaPayload?.omitted === true;
  const resolvedMimetype =
    mimetype ?? inferWhatsappMimetypeFromMessageType(messageType);
  const built = buildWhatsappMediaMetadata({
    filename,
    mimetype: resolvedMimetype,
    inlineBase64,
    omitted,
  });
  if (built) {
    return built;
  }
  if (!messageType) {
    return null;
  }
  const type = messageType.toLowerCase();
  if (type === 'text' || type === 'chat' || type === 'e2e_notification') {
    return null;
  }
  return buildWhatsappMediaMetadata({
    filename,
    mimetype: resolvedMimetype ?? 'application/octet-stream',
    omitted,
  });
}
