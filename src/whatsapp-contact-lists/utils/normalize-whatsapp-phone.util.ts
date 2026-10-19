const MIN_PHONE_DIGITS = 8;
const MAX_PHONE_DIGITS = 15;

export function normalizeWhatsappPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS) {
    return null;
  }

  return hasPlus ? `+${digits}` : digits;
}

export function isValidWhatsappPhone(raw: string): boolean {
  return normalizeWhatsappPhone(raw) !== null;
}

/** Digits-only form for matching inbound OpenWA chat ids to stored phones. */
export function whatsappPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Canonical E.164 (`+` + digits) for persistence and deduplication. */
export function canonicalWhatsappPhoneE164(raw: string): string | null {
  const normalized = normalizeWhatsappPhone(raw);
  if (!normalized) {
    return null;
  }
  const digits = whatsappPhoneDigits(normalized);
  if (!digits) {
    return null;
  }
  return `+${digits}`;
}
