import {
  messageTypeFromMimetype,
  resolveOpenWaMediaSendPath,
} from './whatsapp-send-media.util';

describe('whatsapp-send-media.util', () => {
  it('always routes inbox attachments to send-document', () => {
    expect(resolveOpenWaMediaSendPath('image/png')).toBe('send-document');
    expect(resolveOpenWaMediaSendPath('video/mp4')).toBe('send-document');
    expect(resolveOpenWaMediaSendPath('audio/ogg')).toBe('send-document');
    expect(resolveOpenWaMediaSendPath('application/pdf')).toBe('send-document');
  });

  it('persists outbound rows as document type', () => {
    expect(messageTypeFromMimetype('image/jpeg')).toBe('document');
    expect(messageTypeFromMimetype('application/pdf')).toBe('document');
  });
});
