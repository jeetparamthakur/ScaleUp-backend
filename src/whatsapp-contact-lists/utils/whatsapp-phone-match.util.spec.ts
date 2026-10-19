import { whatsappPhonesMatchForReply } from './whatsapp-phone-match.util';

describe('whatsappPhonesMatchForReply', () => {
  it('matches full digits', () => {
    expect(whatsappPhonesMatchForReply('+919876543210', '919876543210')).toBe(
      true,
    );
  });

  it('matches when inbound includes country code', () => {
    expect(whatsappPhonesMatchForReply('8770133619', '918770133619')).toBe(
      true,
    );
    expect(whatsappPhonesMatchForReply('+8770133619', '918770133619')).toBe(
      true,
    );
  });
});
