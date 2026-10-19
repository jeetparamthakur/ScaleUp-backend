import { resolveOpenWaInboundPhoneDigits } from './openwa-inbound-phone.util';

describe('resolveOpenWaInboundPhoneDigits', () => {
  it('prefers senderPhone for @lid senders', () => {
    expect(
      resolveOpenWaInboundPhoneDigits({
        from: '123456789012345@lid',
        senderPhone: '919876543210',
        body: 'Hi',
      }),
    ).toBe('919876543210');
  });

  it('resolves from @c.us jid', () => {
    expect(
      resolveOpenWaInboundPhoneDigits({
        from: '919876543210@c.us',
        body: 'Hi',
      }),
    ).toBe('919876543210');
  });

  it('ignores group chats', () => {
    expect(
      resolveOpenWaInboundPhoneDigits({
        isGroup: true,
        from: '919876543210@c.us',
      }),
    ).toBeNull();
  });
});
