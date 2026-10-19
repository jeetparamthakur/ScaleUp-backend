export function phoneToOpenWaChatId(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '');
  if (!digits) {
    throw new Error('Invalid phone for WhatsApp chat id');
  }
  return `${digits}@c.us`;
}

export function openWaChatIdToPhoneE164(chatId: string): string | null {
  const trimmed = chatId.trim();
  if (!trimmed) {
    return null;
  }

  const atIndex = trimmed.indexOf('@');
  const local = atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed;
  const digits = local.replace(/\D/g, '');
  if (digits.length < 8) {
    return null;
  }

  return `+${digits}`;
}
