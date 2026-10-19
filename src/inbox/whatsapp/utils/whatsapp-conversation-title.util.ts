const JID_SUFFIX_PATTERN = /@(c\.us|lid|g\.us|s\.whatsapp\.net|broadcast)$/i;

const UNRESOLVED_LID_PLACEHOLDER = 'Contact';

export function looksLikeWhatsappJid(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.includes('@')) {
    return false;
  }
  return JID_SUFFIX_PATTERN.test(trimmed) || trimmed.includes('@');
}

export function formatWhatsappPhoneDigits(digits: string): string {
  const normalized = digits.replace(/\D/g, '');
  if (!normalized) {
    return '';
  }
  if (normalized.length < 8) {
    return normalized;
  }
  if (normalized.length === 10) {
    return `+91 ${normalized.slice(0, 5)} ${normalized.slice(5)}`;
  }
  if (normalized.length >= 11) {
    const localLen = 10;
    const country = normalized.slice(0, normalized.length - localLen);
    const local = normalized.slice(-localLen);
    return `+${country} ${local.slice(0, 5)} ${local.slice(5)}`;
  }
  return `+${normalized}`;
}

export function formatWhatsappChatIdForDisplay(
  chatId: string,
  isGroup: boolean,
): string {
  const trimmed = chatId.trim();
  if (!trimmed) {
    return isGroup ? 'Group' : '';
  }

  if (isGroup) {
    return 'Group';
  }

  const atIndex = trimmed.indexOf('@');
  const local = atIndex >= 0 ? trimmed.slice(0, atIndex) : trimmed;
  const suffix = atIndex >= 0 ? trimmed.slice(atIndex + 1).toLowerCase() : '';
  const digits = local.replace(/\D/g, '');

  if (suffix === 'c.us' || suffix === 's.whatsapp.net') {
    return formatWhatsappPhoneDigits(digits);
  }

  if (suffix === 'lid') {
    if (digits.length >= 8 && digits.length <= 13) {
      return formatWhatsappPhoneDigits(digits);
    }
    return '';
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return formatWhatsappPhoneDigits(digits);
  }

  return '';
}

export interface WhatsappConversationTitleHints {
  title: string;
  chatId: string;
  isGroup: boolean;
  savedName?: string | null;
  pushName?: string | null;
  phoneDigits?: string | null;
}

/** Saved name → push name → readable title → phone → formatted chat id. */
export function pickWhatsappConversationTitle(
  hints: WhatsappConversationTitleHints,
): string {
  const { title, chatId, isGroup } = hints;

  if (isGroup) {
    const groupTitle = title.trim();
    if (groupTitle && !looksLikeWhatsappJid(groupTitle)) {
      return groupTitle;
    }
    return 'Group';
  }

  const savedName = hints.savedName?.trim();
  if (savedName) {
    return savedName;
  }

  const pushName = hints.pushName?.trim();
  if (pushName && !looksLikeWhatsappJid(pushName)) {
    return pushName;
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle && !looksLikeWhatsappJid(trimmedTitle)) {
    return trimmedTitle;
  }

  const phone = hints.phoneDigits?.replace(/\D/g, '') ?? '';
  if (phone.length >= 8) {
    const formatted = formatWhatsappPhoneDigits(phone);
    if (formatted) {
      return formatted;
    }
  }

  const fromChatId = formatWhatsappChatIdForDisplay(chatId, false);
  if (fromChatId) {
    return fromChatId;
  }

  if (trimmedTitle && looksLikeWhatsappJid(trimmedTitle)) {
    return formatWhatsappChatIdForDisplay(trimmedTitle, false);
  }

  return UNRESOLVED_LID_PLACEHOLDER;
}

export function needsWhatsappContactResolve(
  title: string,
  chatId: string,
  isGroup: boolean,
): boolean {
  if (isGroup) {
    return false;
  }
  const picked = pickWhatsappConversationTitle({ title, chatId, isGroup });
  return (
    picked === UNRESOLVED_LID_PLACEHOLDER ||
    looksLikeWhatsappJid(title.trim()) ||
    (chatId.includes('@lid') && picked === UNRESOLVED_LID_PLACEHOLDER)
  );
}

/** @deprecated Use pickWhatsappConversationTitle; kept for simple call sites. */
export function normalizeWhatsappConversationTitle(
  title: string,
  chatId: string,
  isGroup: boolean,
): string {
  return pickWhatsappConversationTitle({ title, chatId, isGroup });
}
