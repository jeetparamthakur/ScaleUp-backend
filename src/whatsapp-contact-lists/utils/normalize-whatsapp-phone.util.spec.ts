import {
  canonicalWhatsappPhoneE164,
  whatsappPhoneDigits,
} from './normalize-whatsapp-phone.util';

describe('whatsapp phone canonicalization', () => {
  it('canonicalWhatsappPhoneE164 always prefixes plus', () => {
    expect(canonicalWhatsappPhoneE164('919876543210')).toBe('+919876543210');
    expect(canonicalWhatsappPhoneE164('+919876543210')).toBe('+919876543210');
  });

  it('whatsappPhoneDigits strips formatting', () => {
    expect(whatsappPhoneDigits('+91 98765-43210')).toBe('919876543210');
    expect(whatsappPhoneDigits('919876543210')).toBe('919876543210');
  });
});
