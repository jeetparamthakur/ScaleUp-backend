import {
  formatWhatsappChatIdForDisplay,
  looksLikeWhatsappJid,
  needsWhatsappContactResolve,
  pickWhatsappConversationTitle,
} from './whatsapp-conversation-title.util';

describe('pickWhatsappConversationTitle', () => {
  it('keeps a saved contact name', () => {
    expect(
      pickWhatsappConversationTitle({
        title: '108383550087287@lid',
        chatId: '108383550087287@lid',
        isGroup: false,
        savedName: 'Rahul Sharma',
      }),
    ).toBe('Rahul Sharma');
  });

  it('uses push name when present', () => {
    expect(
      pickWhatsappConversationTitle({
        title: '108383550087287@lid',
        chatId: '108383550087287@lid',
        isGroup: false,
        pushName: 'Rahul',
      }),
    ).toBe('Rahul');
  });

  it('formats @c.us chat ids as a phone number', () => {
    expect(
      pickWhatsappConversationTitle({
        title: '919632037640@c.us',
        chatId: '919632037640@c.us',
        isGroup: false,
      }),
    ).toBe('+91 96320 37640');
  });

  it('formats resolved phone digits for @lid chats', () => {
    expect(
      pickWhatsappConversationTitle({
        title: '108383550087287@lid',
        chatId: '108383550087287@lid',
        isGroup: false,
        phoneDigits: '919632037640',
      }),
    ).toBe('+91 96320 37640');
  });

  it('flags unresolved @lid chats for contact lookup', () => {
    expect(
      needsWhatsappContactResolve(
        '108383550087287@lid',
        '108383550087287@lid',
        false,
      ),
    ).toBe(true);
    expect(looksLikeWhatsappJid('108383550087287@lid')).toBe(true);
  });
});

describe('formatWhatsappChatIdForDisplay', () => {
  it('formats standard user jid', () => {
    expect(formatWhatsappChatIdForDisplay('919632037640@c.us', false)).toBe(
      '+91 96320 37640',
    );
  });
});
