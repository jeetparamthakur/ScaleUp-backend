import { Injectable } from '@nestjs/common';
import type {
  OpenWaHistoryMessage,
  OpenWaSendTextResponse,
} from './openwa-http.client';
import { WhatsappConversationEntity } from './entities/whatsapp-conversation.entity';
import { WhatsappMessageEntity } from './entities/whatsapp-message.entity';
import { WhatsappConversationRepository } from './whatsapp-conversation.repository';
import { WhatsappMessageRepository } from './whatsapp-message.repository';
import { WhatsappConversationContactResolverService } from './whatsapp-conversation-contact-resolver.service';
import {
  looksLikeWhatsappJid,
  pickWhatsappConversationTitle,
} from './utils/whatsapp-conversation-title.util';
import {
  buildWhatsappMediaMetadata,
  buildWhatsappMediaMetadataFromWebhook,
  messageTypeSupportsMediaFetch,
  normalizeWhatsappWebhookMessageType,
  readCachedMediaFromMetadata,
} from './utils/whatsapp-message-media-metadata.util';
import type { WhatsappWebhookMessageUpsert } from './types/whatsapp-webhook-upsert.types';

@Injectable()
export class WhatsappInboxPersistenceService {
  constructor(
    private readonly conversationRepository: WhatsappConversationRepository,
    private readonly messageRepository: WhatsappMessageRepository,
    private readonly contactResolver: WhatsappConversationContactResolverService,
  ) {}

  async ensureConversation(
    connectionId: string,
    chatId: string,
    title: string,
    isGroup: boolean,
    lastMessagePreview: string | null,
    timestampSeconds: number | null | undefined,
    unreadCount = 0,
  ): Promise<WhatsappConversationEntity> {
    return this.ensureConversationInternal(
      { connectionId, senderConnectionId: null },
      chatId,
      title,
      isGroup,
      lastMessagePreview,
      timestampSeconds,
      unreadCount,
    );
  }

  async ensureConversationForSender(
    senderConnectionId: string,
    chatId: string,
    title: string,
    isGroup: boolean,
    lastMessagePreview: string | null,
    timestampSeconds: number | null | undefined,
    unreadCount = 0,
  ): Promise<WhatsappConversationEntity> {
    return this.ensureConversationInternal(
      { connectionId: null, senderConnectionId },
      chatId,
      title,
      isGroup,
      lastMessagePreview,
      timestampSeconds,
      unreadCount,
    );
  }

  private async ensureConversationInternal(
    owner: { connectionId: string | null; senderConnectionId: string | null },
    chatId: string,
    title: string,
    isGroup: boolean,
    lastMessagePreview: string | null,
    timestampSeconds: number | null | undefined,
    unreadCount = 0,
  ): Promise<WhatsappConversationEntity> {
    const existing = owner.senderConnectionId
      ? await this.conversationRepository.findBySenderConnectionAndChatId(
          owner.senderConnectionId,
          chatId,
        )
      : owner.connectionId
        ? await this.conversationRepository.findByConnectionAndChatId(
            owner.connectionId,
            chatId,
          )
        : null;

    const lastMessageAt =
      timestampSeconds && timestampSeconds > 0
        ? new Date(timestampSeconds * 1000)
        : null;

    const normalizedTitle = pickWhatsappConversationTitle({
      title,
      chatId,
      isGroup,
    });

    if (existing) {
      const incomingReadable =
        title.trim() && !looksLikeWhatsappJid(title) ? title.trim() : null;
      if (incomingReadable) {
        existing.title = incomingReadable;
      } else if (looksLikeWhatsappJid(existing.title)) {
        existing.title = normalizedTitle;
      }
      existing.isGroup = isGroup;
      if (lastMessagePreview) {
        existing.lastMessagePreview = lastMessagePreview;
      }
      if (lastMessageAt) {
        existing.lastMessageAt = lastMessageAt;
      }
      existing.unreadCount = unreadCount;
      return this.conversationRepository.save(existing);
    }

    const created = this.conversationRepository.create({
      connectionId: owner.connectionId,
      senderConnectionId: owner.senderConnectionId,
      chatId,
      title: normalizedTitle,
      isGroup,
      lastMessagePreview,
      lastMessageAt,
      unreadCount,
    });
    return this.conversationRepository.save(created);
  }

  async upsertFromHistoryMessage(
    conversation: WhatsappConversationEntity,
    message: OpenWaHistoryMessage,
  ): Promise<void> {
    const sentAt = new Date(message.timestamp * 1000);
    const historyMedia = message.media;
    const normalizedHistoryType = normalizeWhatsappWebhookMessageType(
      message.type ?? 'text',
      historyMedia?.mimetype ?? null,
      Boolean(historyMedia),
    );
    const mediaMetadata =
      normalizedHistoryType !== 'text' &&
      normalizedHistoryType !== 'chat' &&
      normalizedHistoryType !== 'e2e_notification'
        ? buildWhatsappMediaMetadata({
            filename: historyMedia?.filename ?? null,
            mimetype:
              historyMedia?.mimetype ??
              (normalizedHistoryType === 'unknown'
                ? 'application/octet-stream'
                : null),
            inlineBase64:
              typeof historyMedia?.data === 'string' ? historyMedia.data : null,
            omitted: historyMedia?.omitted === true,
          })
        : null;

    await this.messageRepository.upsertMessage({
      conversationId: conversation.id,
      externalId: message.id,
      fromMe: message.fromMe,
      body: message.body ?? null,
      messageType: normalizedHistoryType,
      mediaMetadata,
      sentAt,
    });

    if (!conversation.lastMessageAt || sentAt > conversation.lastMessageAt) {
      conversation.lastMessageAt = sentAt;
      conversation.lastMessagePreview = message.body ?? null;
      await this.conversationRepository.save(conversation);
    }
  }

  async upsertFromSendResponse(
    conversation: WhatsappConversationEntity,
    text: string,
    response: OpenWaSendTextResponse,
  ): Promise<WhatsappMessageEntity> {
    return this.upsertFromOutboundSend(conversation, {
      body: text,
      messageType: 'text',
      mediaMetadata: null,
      preview: text,
      response,
    });
  }

  async upsertFromMediaSendResponse(
    conversation: WhatsappConversationEntity,
    input: {
      body: string | null;
      messageType: string;
      mediaMetadata: Record<string, unknown> | null;
      preview: string;
    },
    response: OpenWaSendTextResponse,
  ): Promise<WhatsappMessageEntity> {
    return this.upsertFromOutboundSend(conversation, {
      ...input,
      response,
    });
  }

  private async upsertFromOutboundSend(
    conversation: WhatsappConversationEntity,
    input: {
      body: string | null;
      messageType: string;
      mediaMetadata: Record<string, unknown> | null;
      preview: string;
      response: OpenWaSendTextResponse;
    },
  ): Promise<WhatsappMessageEntity> {
    const sentAt = new Date(input.response.timestamp * 1000);
    const message = await this.messageRepository.upsertMessage({
      conversationId: conversation.id,
      externalId: input.response.messageId,
      fromMe: true,
      body: input.body,
      messageType: input.messageType,
      mediaMetadata: input.mediaMetadata,
      sentAt,
    });

    conversation.lastMessageAt = sentAt;
    conversation.lastMessagePreview = input.preview;
    conversation.unreadCount = 0;
    await this.conversationRepository.save(conversation);
    return message;
  }

  async upsertFromWebhookPayloadForSender(
    senderConnectionId: string,
    payload: Record<string, unknown>,
  ): Promise<WhatsappWebhookMessageUpsert | null> {
    return this.upsertFromWebhookPayloadInternal(
      { connectionId: null, senderConnectionId },
      payload,
    );
  }

  async upsertFromWebhookPayload(
    connectionId: string,
    payload: Record<string, unknown>,
  ): Promise<WhatsappWebhookMessageUpsert | null> {
    return this.upsertFromWebhookPayloadInternal(
      { connectionId, senderConnectionId: null },
      payload,
    );
  }

  private async upsertFromWebhookPayloadInternal(
    owner: { connectionId: string | null; senderConnectionId: string | null },
    payload: Record<string, unknown>,
  ): Promise<WhatsappWebhookMessageUpsert | null> {
    const chatId =
      this.readString(payload, 'chatId') ?? this.readString(payload, 'from');
    const messageId = this.readString(payload, 'id');
    if (!chatId || !messageId) {
      return null;
    }

    const rawChatName = this.readString(payload, 'chatName');
    const pushName = this.readString(payload, 'pushName');
    const senderPhone = this.readString(payload, 'senderPhone');
    const contactHints =
      this.contactResolver.readContactHintsFromPayload(payload);
    const preferredTitle =
      rawChatName && !looksLikeWhatsappJid(rawChatName)
        ? rawChatName
        : (pushName ?? rawChatName ?? chatId);
    const isGroup = Boolean(payload.isGroup);
    const chatName = pickWhatsappConversationTitle({
      title: preferredTitle,
      chatId,
      isGroup,
      savedName: contactHints?.name ?? null,
      pushName: contactHints?.pushName ?? pushName,
      phoneDigits: contactHints?.number || senderPhone,
    });
    const body = this.readString(payload, 'body');
    const fromMe = Boolean(payload.fromMe);
    const rawType = this.readString(payload, 'type') ?? 'text';
    const mediaPayload =
      payload.media && typeof payload.media === 'object'
        ? (payload.media as Record<string, unknown>)
        : null;
    const filename =
      this.readString(payload, 'filename') ??
      this.readString(payload, 'fileName') ??
      (mediaPayload ? this.readString(mediaPayload, 'filename') : null) ??
      (mediaPayload ? this.readString(mediaPayload, 'fileName') : null);
    const mimetype =
      this.readString(payload, 'mimetype') ??
      (mediaPayload ? this.readString(mediaPayload, 'mimetype') : null);
    const type = normalizeWhatsappWebhookMessageType(
      rawType,
      mimetype,
      Boolean(mediaPayload),
    );
    const timestamp =
      typeof payload.timestamp === 'number'
        ? payload.timestamp
        : Date.now() / 1000;

    const conversation = owner.senderConnectionId
      ? await this.ensureConversationForSender(
          owner.senderConnectionId,
          chatId,
          chatName,
          isGroup,
          body,
          timestamp,
          fromMe ? 0 : 1,
        )
      : owner.connectionId
        ? await this.ensureConversation(
            owner.connectionId,
            chatId,
            chatName,
            isGroup,
            body,
            timestamp,
            fromMe ? 0 : 1,
          )
        : null;

    if (!conversation) {
      return null;
    }

    const sentAt = new Date(timestamp * 1000);
    const normalizedType = type.toLowerCase();
    const isMedia =
      normalizedType !== 'text' &&
      normalizedType !== 'chat' &&
      normalizedType !== 'e2e_notification';
    const mediaMetadata = isMedia
      ? buildWhatsappMediaMetadataFromWebhook(payload, filename, mimetype, type)
      : null;

    const preview =
      body?.trim() ||
      (normalizedType === 'image' || normalizedType === 'sticker'
        ? 'Photo'
        : normalizedType === 'video'
          ? 'Video'
          : normalizedType === 'audio' || normalizedType === 'ptt'
            ? 'Audio'
            : filename || (isMedia ? 'Attachment' : null));

    const message = await this.messageRepository.upsertMessage({
      conversationId: conversation.id,
      externalId: messageId,
      fromMe,
      body,
      messageType: type,
      mediaMetadata,
      sentAt,
    });

    conversation.lastMessageAt = sentAt;
    conversation.lastMessagePreview = preview;
    await this.conversationRepository.save(conversation);

    const needsMediaPrefetch =
      isMedia &&
      messageTypeSupportsMediaFetch(type, mimetype) &&
      !readCachedMediaFromMetadata(message.mediaMetadata);

    return {
      conversationId: conversation.id,
      messageId: message.id,
      fromMe,
      needsMediaPrefetch,
    };
  }

  private readString(
    payload: Record<string, unknown>,
    key: string,
  ): string | null {
    const value = payload[key];
    return typeof value === 'string' && value.trim() ? value : null;
  }
}
