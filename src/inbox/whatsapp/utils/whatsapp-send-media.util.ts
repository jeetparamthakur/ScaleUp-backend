export type OpenWaMediaSendPath =
  'send-image' | 'send-video' | 'send-audio' | 'send-document';

/** Inbox attachments are always sent as WhatsApp documents (named files). */
export function resolveOpenWaMediaSendPath(
  mimetype: string,
): OpenWaMediaSendPath {
  void mimetype;
  return 'send-document';
}

export function messageTypeFromMimetype(mimetype: string): string {
  void mimetype;
  return 'document';
}
