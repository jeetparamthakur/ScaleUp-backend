import type { OpenWaHistoryMessage } from '../openwa-http.client';

/** Match WhatsApp message ids across webhook, DB, and live-history shapes. */
export function openWaHistoryMessageIdMatches(
  historyId: string,
  externalId: string,
): boolean {
  if (historyId === externalId) {
    return true;
  }
  return historyId.endsWith(externalId) || externalId.endsWith(historyId);
}

export function findOpenWaHistoryMessage(
  history: OpenWaHistoryMessage[],
  externalId: string,
): OpenWaHistoryMessage | undefined {
  return history.find((entry) =>
    openWaHistoryMessageIdMatches(entry.id, externalId),
  );
}

export type OpenWaMediaMessageIdContext = {
  chatId?: string | null;
  fromMe?: boolean;
  /** Extra chat JIDs (e.g. phone JIDs resolved from a LID conversation). */
  alternateChatIds?: string[];
};

const WHATSAPP_GROUP_AUTHOR_SUFFIX =
  /^(true|false)_(\d+@g\.us)_(\d+)_(\d+@(?:c\.us|s\.whatsapp\.net|lid))$/i;
const WHATSAPP_GROUP_UNPREFIXED =
  /^(\d+@g\.us)_(\d+)_(\d+@(?:c\.us|s\.whatsapp\.net|lid))$/i;

function isBareWhatsappAddress(value: string): boolean {
  return /^\d+@(?:c\.us|s\.whatsapp\.net|lid|g\.us)$/i.test(value.trim());
}

/** `false_<chatJid>_<messageKey>` as emitted by whatsapp-web.js (1:1 and group). */
export function parseSerializedWhatsappMessageId(
  externalId: string,
): { direction: 'true' | 'false'; chatJid: string; messageKey: string } | null {
  const trimmed = externalId.trim();
  const group = WHATSAPP_GROUP_AUTHOR_SUFFIX.exec(trimmed);
  if (group) {
    return {
      direction: group[1].toLowerCase() as 'true' | 'false',
      chatJid: group[2],
      messageKey: `${group[3]}_${group[4]}`,
    };
  }
  const match = /^(true|false)_([\s\S]+)_([A-Za-z0-9]+)$/i.exec(trimmed);
  if (!match) {
    return null;
  }
  return {
    direction: match[1].toLowerCase() as 'true' | 'false',
    chatJid: match[2],
    messageKey: match[3],
  };
}

function parseUnprefixedGroupWhatsappMessageId(
  externalId: string,
): { chatJid: string; messageKey: string } | null {
  const trimmed = externalId.trim();
  const group = WHATSAPP_GROUP_UNPREFIXED.exec(trimmed);
  if (!group) {
    return null;
  }
  return {
    chatJid: group[1],
    messageKey: `${group[2]}_${group[3]}`,
  };
}

/** `{chatJid}_{messageKey}` without a `true_`/`false_` prefix (common on persisted outbound rows). */
function parseChatJidUnderscoreMessageKey(
  externalId: string,
): { chatJid: string; messageKey: string } | null {
  const trimmed = externalId.trim();
  if (/^(true|false)_/i.test(trimmed)) {
    return null;
  }
  const idx = trimmed.lastIndexOf('_');
  if (idx <= 0) {
    return null;
  }
  const chatJid = trimmed.slice(0, idx);
  const messageKey = trimmed.slice(idx + 1);
  if (!chatJid.includes('@') || messageKey.length < 8) {
    return null;
  }
  return { chatJid, messageKey };
}

function appendSerializedIdsForChatJids(
  candidates: string[],
  messageKey: string,
  chatJids: string[],
  directions: Array<'true' | 'false'>,
): void {
  for (const chatJid of chatJids) {
    const trimmedChat = chatJid.trim();
    if (!trimmedChat) {
      continue;
    }
    for (const direction of directions) {
      candidates.push(`${direction}_${trimmedChat}_${messageKey}`);
    }
    candidates.push(`${trimmedChat}_${messageKey}`);
  }
}

/** Alternate WhatsApp message id shapes accepted by wwebjs `getMessageById`. */
export function buildOpenWaMediaMessageIdCandidates(
  externalId: string,
  context?: OpenWaMediaMessageIdContext,
): string[] {
  const trimmed = externalId.trim();
  const candidates = [trimmed].filter(Boolean);
  const withoutDirection = trimmed.replace(/^(true|false)_/, '');
  if (withoutDirection && withoutDirection !== trimmed) {
    candidates.push(withoutDirection);
  }
  const lastSegment = trimmed.includes('_')
    ? trimmed.split('_').pop()
    : trimmed;
  if (
    lastSegment &&
    lastSegment !== trimmed &&
    lastSegment.length >= 8 &&
    !isBareWhatsappAddress(lastSegment)
  ) {
    candidates.push(lastSegment);
  }

  const opaque = parseChatJidUnderscoreMessageKey(trimmed);
  const groupUnprefixed = parseUnprefixedGroupWhatsappMessageId(trimmed);
  if (opaque) {
    appendSerializedIdsForChatJids(
      candidates,
      opaque.messageKey,
      [opaque.chatJid],
      ['false', 'true'],
    );
  }
  if (groupUnprefixed) {
    appendSerializedIdsForChatJids(
      candidates,
      groupUnprefixed.messageKey,
      [groupUnprefixed.chatJid],
      ['false', 'true'],
    );
  }

  const chatId = context?.chatId?.trim();
  const directionFromContext = context?.fromMe === true ? 'true' : 'false';
  const directions: Array<'true' | 'false'> = [
    directionFromContext,
    directionFromContext === 'true' ? 'false' : 'true',
  ];

  const parsedSerialized = parseSerializedWhatsappMessageId(trimmed);
  const messageKey =
    parsedSerialized?.messageKey ??
    opaque?.messageKey ??
    groupUnprefixed?.messageKey ??
    (lastSegment &&
    lastSegment.length >= 8 &&
    !isBareWhatsappAddress(lastSegment)
      ? lastSegment
      : trimmed);
  const chatJids = [
    ...(chatId ? [chatId] : []),
    ...(context?.alternateChatIds ?? []),
  ];
  const uniqueChatJids = [
    ...new Set(chatJids.map((id) => id.trim()).filter(Boolean)),
  ];

  if (messageKey.length >= 8 && uniqueChatJids.length > 0) {
    appendSerializedIdsForChatJids(
      candidates,
      messageKey,
      uniqueChatJids,
      directions,
    );
  }

  const parsed = parseSerializedWhatsappMessageId(trimmed);
  if (parsed && uniqueChatJids.length > 0) {
    appendSerializedIdsForChatJids(
      candidates,
      parsed.messageKey,
      uniqueChatJids,
      [parsed.direction, ...directions],
    );
  }

  if (
    chatId &&
    messageKey &&
    messageKey.length >= 8 &&
    !trimmed.includes('_')
  ) {
    candidates.push(`${directionFromContext}_${chatId}_${messageKey}`);
    candidates.push(`${chatId}_${messageKey}`);
  }
  return [...new Set(candidates)].filter(
    (candidate) => !isBareWhatsappAddress(candidate) || candidate === trimmed,
  );
}

function appendPhoneJidCandidates(
  candidates: string[],
  resolvedPhoneE164: string | null | undefined,
): string[] {
  const digits = resolvedPhoneE164?.replace(/\D/g, '') ?? '';
  if (digits.length >= 8) {
    candidates.push(`${digits}@c.us`, `${digits}@s.whatsapp.net`);
  }
  return [...new Set(candidates)];
}

export function buildOpenWaMediaChatIdCandidates(
  chatId: string,
  resolvedPhoneE164: string | null | undefined,
): string[] {
  const trimmed = chatId.trim();
  const candidates = [trimmed].filter(Boolean);
  // LID-migrated 1:1 chats are keyed by `@lid` in WhatsApp Web. Opening the resolved phone JID
  // (`getChatById` on `@c.us`) often throws "No LID for user" and breaks media/history fetches.
  if (trimmed.includes('@lid')) {
    return [...new Set(candidates)];
  }
  return appendPhoneJidCandidates(candidates, resolvedPhoneE164);
}

/**
 * Chat ids to try for GET .../media. Unlike history listing, the media endpoint resolves LID
 * mappings server-side and often needs the phone JID when the conversation is stored as `@lid`.
 */
export function buildOpenWaMediaDownloadChatIdCandidates(
  chatId: string,
  resolvedPhoneE164: string | null | undefined,
): string[] {
  const trimmed = chatId.trim();
  const candidates = [trimmed].filter(Boolean);
  return appendPhoneJidCandidates(candidates, resolvedPhoneE164);
}

export const OPEN_WA_DIRECT_MEDIA_FETCH_MAX_ATTEMPTS = 8;

export type OpenWaMediaFetchAttempt = {
  chatId: string;
  messageId: string;
};

/**
 * Orders chat/message pairs so the most likely OpenWA GET /media hit is tried first and caps how
 * many expensive on-demand downloads we trigger (each miss can scan ~300 messages in the gateway).
 */
export function buildPrioritizedOpenWaMediaFetchAttempts(
  primaryChatId: string,
  externalId: string,
  downloadChatIdCandidates: string[],
  messageIdCandidates: string[],
  maxAttempts = OPEN_WA_DIRECT_MEDIA_FETCH_MAX_ATTEMPTS,
): OpenWaMediaFetchAttempt[] {
  const attempts: OpenWaMediaFetchAttempt[] = [];
  const seen = new Set<string>();

  const push = (chatId: string, messageId: string) => {
    const trimmedChat = chatId.trim();
    const trimmedMessage = messageId.trim();
    if (!trimmedChat || !trimmedMessage) {
      return;
    }
    const key = `${trimmedChat}\0${trimmedMessage}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    attempts.push({ chatId: trimmedChat, messageId: trimmedMessage });
  };

  const primary = primaryChatId.trim();
  const external = externalId.trim();
  const chats = [
    ...new Set(downloadChatIdCandidates.map((id) => id.trim()).filter(Boolean)),
  ];
  const messageIds = [
    ...new Set(messageIdCandidates.map((id) => id.trim()).filter(Boolean)),
  ];

  if (primary && external) {
    push(primary, external);
  }
  for (const messageId of messageIds) {
    if (primary) {
      push(primary, messageId);
    }
    if (attempts.length >= maxAttempts) {
      return attempts.slice(0, maxAttempts);
    }
  }
  for (const chatId of chats) {
    if (chatId !== primary && external) {
      push(chatId, external);
    }
    if (attempts.length >= maxAttempts) {
      return attempts.slice(0, maxAttempts);
    }
  }
  for (const chatId of chats) {
    for (const messageId of messageIds) {
      push(chatId, messageId);
      if (attempts.length >= maxAttempts) {
        return attempts.slice(0, maxAttempts);
      }
    }
  }

  return attempts.slice(0, maxAttempts);
}
