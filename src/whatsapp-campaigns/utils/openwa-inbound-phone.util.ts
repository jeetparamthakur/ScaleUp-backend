import {
  canonicalWhatsappPhoneE164,
  whatsappPhoneDigits,
} from '../../whatsapp-contact-lists/utils/normalize-whatsapp-phone.util';
import { openWaChatIdToPhoneE164 } from './phone-to-openwa-chat-id.util';

const MIN_PHONE_DIGITS = 8;

function isLidJid(value: string): boolean {
  return value.toLowerCase().includes('@lid');
}

function digitsFromJidOrPhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.includes('@')) {
    if (isLidJid(trimmed)) {
      return null;
    }
    const e164 = openWaChatIdToPhoneE164(trimmed);
    if (!e164) {
      return null;
    }
    const digits = whatsappPhoneDigits(e164);
    return digits.length >= MIN_PHONE_DIGITS ? digits : null;
  }

  const canonical = canonicalWhatsappPhoneE164(trimmed);
  if (canonical) {
    const digits = whatsappPhoneDigits(canonical);
    return digits.length >= MIN_PHONE_DIGITS ? digits : null;
  }

  const digits = whatsappPhoneDigits(trimmed);
  return digits.length >= MIN_PHONE_DIGITS ? digits : null;
}

function readContactNumber(contact: unknown): string | null {
  if (!contact || typeof contact !== 'object') {
    return null;
  }

  const record = contact as Record<string, unknown>;
  const number = record.number;
  if (typeof number !== 'string') {
    return null;
  }

  return digitsFromJidOrPhone(number);
}

/** Resolve inbound OpenWA message payload to dial digits for campaign reply matching. */
export function resolveOpenWaInboundPhoneDigits(
  payload: Record<string, unknown>,
): string | null {
  if (payload.isGroup) {
    return null;
  }

  const candidates: string[] = [];

  if (typeof payload.senderPhone === 'string') {
    candidates.push(payload.senderPhone);
  }

  const contactNumber = readContactNumber(payload.contact);
  if (contactNumber) {
    candidates.push(contactNumber);
  }

  if (typeof payload.from === 'string') {
    candidates.push(payload.from);
  }

  if (typeof payload.chatId === 'string') {
    candidates.push(payload.chatId);
  }

  for (const candidate of candidates) {
    const digits = digitsFromJidOrPhone(candidate);
    if (digits) {
      return digits;
    }
  }

  return null;
}
