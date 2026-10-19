import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  forwardRef,
} from '@nestjs/common';
import {
  messageTypeFromMimetype,
  resolveOpenWaMediaSendPath,
} from './utils/whatsapp-send-media.util';
import type { WhatsappConnectionStatus } from './entities/user-whatsapp-connection.entity';
import { WhatsappSenderConnectionRepository } from '../../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import { WhatsappSenderWebhookService } from '../../whatsapp-sender-connections/whatsapp-sender-webhook.service';
import type { WhatsappSenderConnectionEntity } from '../../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';
import {
  OpenWaHttpClient,
  type OpenWaHistoryMessage,
} from './openwa-http.client';
import { PlatformOpenWaService } from './platform-openwa.service';
import { WhatsappConversationRepository } from './whatsapp-conversation.repository';
import { WhatsappMessageEntity } from './entities/whatsapp-message.entity';
import { WhatsappInboxPersistenceService } from './whatsapp-inbox-persistence.service';
import { WhatsappMessageRepository } from './whatsapp-message.repository';
import { WhatsappConversationContactResolverService } from './whatsapp-conversation-contact-resolver.service';
import { WhatsappBackfillService } from './whatsapp-backfill.service';
import {
  looksLikeWhatsappJid,
  pickWhatsappConversationTitle,
} from './utils/whatsapp-conversation-title.util';
import {
  buildWhatsappMediaMetadata,
  messageTypeSupportsMediaFetch,
  readCachedMediaFromMetadata,
  stripInlineMediaDataForApi,
  WHATSAPP_INBOX_CACHED_MEDIA_MAX_BYTES,
} from './utils/whatsapp-message-media-metadata.util';
import {
  buildOpenWaMediaChatIdCandidates,
  buildOpenWaMediaDownloadChatIdCandidates,
  buildOpenWaMediaMessageIdCandidates,
  buildPrioritizedOpenWaMediaFetchAttempts,
  findOpenWaHistoryMessage,
} from './utils/whatsapp-openwa-media-fetch.util';
import {
  isOpenWaTransientGatewayError,
  shouldContinueOpenWaMediaFetchAfterError,
  throwIfOpenWaRateLimited,
} from './utils/openwa-http-error.util';
import { withOpenWaMediaRetries } from './utils/openwa-media-retry.util';
import { runOpenWaSessionMediaTask } from './utils/openwa-session-media-queue.util';
import { normalizeWhatsappMediaPayload } from './utils/media-content-type-sniff.util';

export interface WhatsappInboxSenderView {
  id: string;
  displayName: string | null;
  status: string;
  phone: string | null;
  pushName: string | null;
  lastBackfillAt: string | null;
  lastError: string | null;
}

export interface WhatsappInboxMessageMediaResult {
  buffer: Buffer;
  contentType: string;
  servedFromCache: boolean;
  cacheEtag: string;
}

@Injectable()
export class WhatsappInboxService implements OnModuleDestroy {
  private static readonly SENDER_OPENWA_REFRESH_TTL_MS = 5 * 60 * 1000;

  private readonly logger = new Logger(WhatsappInboxService.name);
  private readonly mediaFetchInflight = new Map<
    string,
    Promise<WhatsappInboxMessageMediaResult>
  >();
  private readonly senderOpenWaRefreshAt = new Map<string, number>();

  constructor(
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
    private readonly conversationRepository: WhatsappConversationRepository,
    private readonly messageRepository: WhatsappMessageRepository,
    private readonly persistence: WhatsappInboxPersistenceService,
    private readonly contactResolver: WhatsappConversationContactResolverService,
    @Inject(forwardRef(() => WhatsappSenderWebhookService))
    private readonly senderWebhookService: WhatsappSenderWebhookService,
    private readonly backfillService: WhatsappBackfillService,
  ) {}

  onModuleDestroy(): void {
    this.mediaFetchInflight.clear();
    this.senderOpenWaRefreshAt.clear();
  }

  /** Best-effort cache warm after inbound webhooks; does not throw. */
  prefetchInboundMessageMedia(conversationId: string, messageId: string): void {
    void this.runInboundMediaPrefetchWithRetries(conversationId, messageId);
  }

  private async runInboundMediaPrefetchWithRetries(
    conversationId: string,
    messageId: string,
  ): Promise<void> {
    const retryDelaysMs = [0, 5_000, 30_000, 120_000];
    for (const delayMs of retryDelaysMs) {
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      try {
        await this.enqueueMessageMediaLoad(conversationId, messageId, () =>
          this.loadMessageMediaWithoutAuth(conversationId, messageId, {
            lightSenderRefresh: true,
          }),
        );
        return;
      } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        this.logger.debug(
          `Inbound media prefetch attempt for ${conversationId}/${messageId} failed: ${detail}`,
        );
      }
    }
  }

  private enqueueMessageMediaLoad(
    conversationId: string,
    messageId: string,
    loader: () => Promise<WhatsappInboxMessageMediaResult>,
  ): Promise<WhatsappInboxMessageMediaResult> {
    const inflightKey = `${conversationId}:${messageId}`;
    const existing = this.mediaFetchInflight.get(inflightKey);
    if (existing) {
      return existing;
    }

    const work = loader().finally(() => {
      this.mediaFetchInflight.delete(inflightKey);
    });
    this.mediaFetchInflight.set(inflightKey, work);
    return work;
  }

  /** Pull recent OpenWA history into Marketniti (throttled). No UI signal; safe to poll ~25s. */
  async syncSenderFromOpenWa(
    organizationId: string,
    userId: string,
    senderConnectionId: string,
    conversationId?: string | null,
  ): Promise<void> {
    await this.requireSenderConnection(
      organizationId,
      userId,
      senderConnectionId,
    );

    const priorityChatIds: string[] = [];
    if (conversationId) {
      const conversation =
        await this.conversationRepository.findByIdForSenderConnection(
          conversationId,
          senderConnectionId,
        );
      if (conversation?.chatId) {
        priorityChatIds.push(conversation.chatId);
      }
    }

    await this.backfillService.syncSenderIncremental(senderConnectionId, {
      priorityChatIds,
    });
  }

  async listSenders(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappInboxSenderView[]> {
    const rows = await this.senderConnectionRepository.listByOrgAndUser(
      organizationId,
      userId,
    );

    return rows.map((row) => ({
      id: row.id,
      displayName: row.displayName,
      status: row.status,
      phone: row.phone,
      pushName: row.pushName,
      lastBackfillAt: row.lastBackfillAt?.toISOString() ?? null,
      lastError: row.lastError,
    }));
  }

  async getProfilePictures(
    organizationId: string,
    userId: string,
    senderConnectionId: string,
    chatIds: string[],
  ): Promise<{ pictures: Record<string, string | null> }> {
    const sender = await this.requireSenderConnection(
      organizationId,
      userId,
      senderConnectionId,
    );

    if (sender.status !== 'ready' || !sender.openwaSessionId) {
      return { pictures: {} };
    }

    const unique = [
      ...new Set(chatIds.map((id) => id.trim()).filter(Boolean)),
    ].slice(0, 50);
    if (unique.length === 0) {
      return { pictures: {} };
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    try {
      return await this.openWaClient.getProfilePictures(
        baseUrl,
        apiKey,
        sender.openwaSessionId,
        unique,
      );
    } catch {
      return { pictures: {} };
    }
  }

  async listConversations(
    organizationId: string,
    userId: string,
    senderConnectionId: string,
    limit = 50,
    offset = 0,
  ) {
    await this.requireSenderConnection(
      organizationId,
      userId,
      senderConnectionId,
    );

    const [rows, total] =
      await this.conversationRepository.findBySenderConnectionId(
        senderConnectionId,
        limit,
        offset,
      );

    const items = [];
    for (const row of rows) {
      const title = pickWhatsappConversationTitle({
        title: row.title,
        chatId: row.chatId,
        isGroup: row.isGroup,
      });

      items.push({
        id: row.id,
        chatId: row.chatId,
        title,
        isGroup: row.isGroup,
        lastMessagePreview: row.lastMessagePreview,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
        unreadCount: row.unreadCount,
      });
    }

    return {
      items,
      total,
    };
  }

  async getMessageMedia(
    organizationId: string,
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<WhatsappInboxMessageMediaResult> {
    return this.enqueueMessageMediaLoad(conversationId, messageId, () =>
      this.loadMessageMediaFromOpenWa(
        organizationId,
        userId,
        conversationId,
        messageId,
        { lightSenderRefresh: true },
      ),
    );
  }

  /** Best-effort warm of recent uncached media; does not block the client. */
  prefetchConversationMedia(
    organizationId: string,
    userId: string,
    conversationId: string,
    limit = 12,
  ): void {
    void this.runConversationMediaPrefetch(
      organizationId,
      userId,
      conversationId,
      limit,
    );
  }

  private async runConversationMediaPrefetch(
    organizationId: string,
    userId: string,
    conversationId: string,
    limit: number,
  ): Promise<void> {
    try {
      await this.requireConversationForUser(
        organizationId,
        userId,
        conversationId,
      );
      const [rows] = await this.messageRepository.findByConversation(
        conversationId,
        50,
        0,
      );
      let scheduled = 0;
      for (const row of rows) {
        if (scheduled >= limit) {
          break;
        }
        const mimetype =
          typeof row.mediaMetadata?.mimetype === 'string'
            ? row.mediaMetadata.mimetype
            : null;
        if (!messageTypeSupportsMediaFetch(row.messageType, mimetype)) {
          continue;
        }
        if (readCachedMediaFromMetadata(row.mediaMetadata)) {
          continue;
        }
        scheduled += 1;
        void this.enqueueMessageMediaLoad(conversationId, row.id, () =>
          this.loadMessageMediaFromOpenWa(
            organizationId,
            userId,
            conversationId,
            row.id,
            { lightSenderRefresh: true },
          ),
        ).catch((error: unknown) => {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.debug(
            `Conversation media prefetch ${conversationId}/${row.id} failed: ${detail}`,
          );
        });
      }
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Conversation media prefetch skipped for ${conversationId}: ${detail}`,
      );
    }
  }

  private async loadMessageMediaFromOpenWa(
    organizationId: string,
    userId: string,
    conversationId: string,
    messageId: string,
    options: { lightSenderRefresh?: boolean } = {},
  ): Promise<WhatsappInboxMessageMediaResult> {
    const conversation = await this.requireConversationForUser(
      organizationId,
      userId,
      conversationId,
    );

    const message = await this.messageRepository.findByIdInConversation(
      messageId,
      conversationId,
    );
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const senderConnectionId = conversation.senderConnectionId;
    if (!senderConnectionId) {
      throw new NotFoundException('Conversation not found');
    }

    const sender = await this.requireSenderConnection(
      organizationId,
      userId,
      senderConnectionId,
    );

    const lightSenderRefresh =
      options.lightSenderRefresh === true && sender.status === 'ready';

    return this.loadMessageMediaForConversation(conversation, message, sender, {
      lightSenderRefresh,
    });
  }

  private async loadMessageMediaWithoutAuth(
    conversationId: string,
    messageId: string,
    options: { lightSenderRefresh?: boolean } = {},
  ): Promise<WhatsappInboxMessageMediaResult> {
    const conversation =
      await this.conversationRepository.findById(conversationId);
    if (!conversation?.senderConnectionId) {
      throw new NotFoundException('Conversation not found');
    }

    const message = await this.messageRepository.findByIdInConversation(
      messageId,
      conversationId,
    );
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const sender = await this.senderConnectionRepository.findById(
      conversation.senderConnectionId,
    );
    if (!sender) {
      throw new NotFoundException('WhatsApp sender not found');
    }

    return this.loadMessageMediaForConversation(
      conversation,
      message,
      sender,
      options,
    );
  }

  private async loadMessageMediaForConversation(
    conversation: Awaited<
      ReturnType<WhatsappConversationRepository['findById']>
    >,
    message: WhatsappMessageEntity,
    sender: WhatsappSenderConnectionEntity,
    options: { lightSenderRefresh?: boolean },
  ): Promise<WhatsappInboxMessageMediaResult> {
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const mimetype =
      typeof message.mediaMetadata?.mimetype === 'string'
        ? message.mediaMetadata.mimetype
        : null;
    if (!messageTypeSupportsMediaFetch(message.messageType, mimetype)) {
      throw new NotFoundException('Message has no displayable media');
    }

    const refreshedSender = await this.refreshSenderFromOpenWa(sender, {
      light: options.lightSenderRefresh === true,
    });

    if (
      refreshedSender.status !== 'ready' ||
      !refreshedSender.openwaSessionId
    ) {
      throw new BadRequestException('WhatsApp sender is not ready');
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const sessionId = refreshedSender.openwaSessionId;

    const stored = readCachedMediaFromMetadata(message.mediaMetadata);
    if (stored) {
      return this.toMessageMediaResult(stored, message.id, true);
    }

    if (
      message.mediaMetadata?.omitted === true ||
      message.mediaMetadata?.mediaUnavailableConfirmed === true
    ) {
      await this.messageRepository.mergeMediaMetadata(
        message.id,
        conversation.id,
        { omitted: false, mediaUnavailableConfirmed: false },
      );
    }

    let resolvedPhone = await this.resolveMediaChatResolvedPhone(
      baseUrl,
      apiKey,
      sessionId,
      conversation.chatId,
    );
    if (!resolvedPhone && conversation.chatId.includes('@lid')) {
      resolvedPhone = this.inferPhoneFromConversationTitle(conversation);
    }
    const historyChatIdCandidates = buildOpenWaMediaChatIdCandidates(
      conversation.chatId,
      resolvedPhone,
    );
    const downloadChatIdCandidates = buildOpenWaMediaDownloadChatIdCandidates(
      conversation.chatId,
      resolvedPhone,
    );

    const messageIdCandidates = buildOpenWaMediaMessageIdCandidates(
      message.externalId,
      {
        chatId: conversation.chatId,
        fromMe: message.fromMe,
        alternateChatIds: downloadChatIdCandidates,
      },
    );
    const isVideoMessage =
      (message.messageType?.toLowerCase() ?? '') === 'video' ||
      (mimetype?.startsWith('video/') ?? false);

    const directAttempts = buildPrioritizedOpenWaMediaFetchAttempts(
      conversation.chatId,
      message.externalId,
      downloadChatIdCandidates,
      messageIdCandidates,
    );
    for (const attempt of directAttempts) {
      const fromOpenWa = await this.fetchOpenWaMessageMedia(
        baseUrl,
        apiKey,
        sessionId,
        attempt.chatId,
        attempt.messageId,
        { isVideo: isVideoMessage },
      );
      if (!fromOpenWa) {
        continue;
      }
      const normalized = this.finalizeMessageMediaPayload(fromOpenWa);
      await this.cacheMessageMediaBytes(
        message.id,
        conversation.id,
        normalized,
      );
      return this.toMessageMediaResult(normalized, message.id, false);
    }

    const fromLiveHistory = await this.resolveMediaFromLiveHistory(
      baseUrl,
      apiKey,
      sessionId,
      historyChatIdCandidates,
      downloadChatIdCandidates,
      message.externalId,
      message.id,
      conversation.id,
    );
    if (!fromLiveHistory) {
      this.logger.debug(
        `Media miss conversation=${conversation.id} message=${message.id} ` +
          `chatId=${conversation.chatId} historyChatCandidates=${JSON.stringify(historyChatIdCandidates)} ` +
          `downloadChatCandidates=${JSON.stringify(downloadChatIdCandidates)} ` +
          `messageIdCandidates=${JSON.stringify(messageIdCandidates)}`,
      );
      throw this.buildMediaUnavailableHttpException(message);
    }

    const normalizedHistory = this.finalizeMessageMediaPayload(fromLiveHistory);
    await this.cacheMessageMediaBytes(
      message.id,
      conversation.id,
      normalizedHistory,
    );
    return this.toMessageMediaResult(normalizedHistory, message.id, false);
  }

  private toMessageMediaResult(
    payload: { buffer: Buffer; contentType: string },
    messageId: string,
    servedFromCache: boolean,
  ): WhatsappInboxMessageMediaResult {
    const normalized = this.finalizeMessageMediaPayload(payload);
    return {
      ...normalized,
      servedFromCache,
      cacheEtag: `"${messageId}-${normalized.buffer.length}"`,
    };
  }

  private buildMediaUnavailableHttpException(
    message: WhatsappMessageEntity,
  ): HttpException {
    const meta = message.mediaMetadata;
    const hasMediaHints =
      typeof meta?.mimetype === 'string' ||
      (typeof meta?.sizeBytes === 'number' && meta.sizeBytes > 0);
    if (hasMediaHints && meta?.mediaUnavailableConfirmed !== true) {
      return new HttpException(
        {
          message:
            'WhatsApp has not finished syncing this media to the linked session yet. Open the chat on your phone (with the sender session online), wait a few seconds, then retry.',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return new NotFoundException('Media is not available for this message');
  }

  private async refreshSenderFromOpenWa(
    sender: WhatsappSenderConnectionEntity,
    options?: { light?: boolean },
  ): Promise<WhatsappSenderConnectionEntity> {
    if (!sender.openwaSessionId) {
      return sender;
    }

    if (options?.light && sender.status === 'ready') {
      const lastRefresh = this.senderOpenWaRefreshAt.get(sender.id) ?? 0;
      if (
        Date.now() - lastRefresh <
        WhatsappInboxService.SENDER_OPENWA_REFRESH_TTL_MS
      ) {
        return sender;
      }
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    try {
      let session = await this.openWaClient.getSession(
        baseUrl,
        apiKey,
        sender.openwaSessionId,
      );
      if (session.status !== 'ready') {
        session = await this.openWaClient
          .startSession(baseUrl, apiKey, sender.openwaSessionId)
          .catch(() => session);
      }

      sender.status = session.status as WhatsappConnectionStatus;
      sender.phone = session.phone ?? null;
      sender.pushName = session.pushName ?? null;
      sender.lastError = session.lastError ?? null;
      await this.senderConnectionRepository.save(sender);

      if (sender.status === 'ready') {
        await this.senderWebhookService.ensureWebhook(sender);
      }

      this.senderOpenWaRefreshAt.set(sender.id, Date.now());
    } catch {
      // Keep the last known DB status when OpenWA is unreachable.
    }

    return sender;
  }

  private async resolveMediaChatResolvedPhone(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    chatId: string,
  ): Promise<string | null> {
    if (!chatId.includes('@lid')) {
      return null;
    }
    return this.openWaClient.resolveContactPhone(
      baseUrl,
      apiKey,
      sessionId,
      chatId,
    );
  }

  private inferPhoneFromConversationTitle(conversation: {
    title: string;
    isGroup: boolean;
  }): string | null {
    if (conversation.isGroup) {
      return null;
    }
    const title = conversation.title?.trim() ?? '';
    if (!title || looksLikeWhatsappJid(title)) {
      return null;
    }
    const digits = title.replace(/\D/g, '');
    if (digits.length < 10) {
      return null;
    }
    return `+${digits}`;
  }

  private finalizeMessageMediaPayload(payload: {
    buffer: Buffer;
    contentType: string;
  }): { buffer: Buffer; contentType: string } {
    if (payload.buffer.length === 0) {
      throw new NotFoundException('Media is not available for this message');
    }
    return normalizeWhatsappMediaPayload(payload);
  }

  private async cacheMessageMediaBytes(
    messageId: string,
    conversationId: string,
    payload: { buffer: Buffer; contentType: string },
  ): Promise<void> {
    if (payload.buffer.length > WHATSAPP_INBOX_CACHED_MEDIA_MAX_BYTES) {
      return;
    }

    const normalized = this.finalizeMessageMediaPayload(payload);

    await this.messageRepository.mergeMediaMetadata(messageId, conversationId, {
      mimetype: normalized.contentType,
      data: normalized.buffer.toString('base64'),
      sizeBytes: normalized.buffer.length,
      omitted: false,
      mediaUnavailableConfirmed: false,
    });
  }

  private async fetchOpenWaMessageMedia(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    chatId: string,
    externalId: string,
    options: { isVideo?: boolean } = {},
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const retryOptions = options.isVideo
      ? { maxAttempts: 8, baseDelayMs: 2000, rateLimitBaseDelayMs: 8000 }
      : { maxAttempts: 6, baseDelayMs: 1500, rateLimitBaseDelayMs: 5000 };

    try {
      return await runOpenWaSessionMediaTask(sessionId, () =>
        withOpenWaMediaRetries(
          () =>
            this.openWaClient.getMessageMedia(
              baseUrl,
              apiKey,
              sessionId,
              chatId,
              externalId,
            ),
          retryOptions,
        ),
      );
    } catch (error) {
      throwIfOpenWaRateLimited(error);
      if (shouldContinueOpenWaMediaFetchAfterError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async resolveMediaFromLiveHistory(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    historyChatIdCandidates: string[],
    downloadChatIdCandidates: string[],
    externalId: string,
    messageId: string,
    conversationId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const historyChats = [...new Set(historyChatIdCandidates)].slice(0, 2);
    const downloadChats = [...new Set(downloadChatIdCandidates)].slice(0, 4);
    const historyPasses: Array<{ limit: number; deep: boolean }> = [
      { limit: 100, deep: false },
    ];

    for (const chatId of historyChats) {
      for (const pass of historyPasses) {
        try {
          const history = await runOpenWaSessionMediaTask(sessionId, () =>
            this.openWaClient.getChatHistory(
              baseUrl,
              apiKey,
              sessionId,
              chatId,
              {
                limit: pass.limit,
                deep: pass.deep,
                includeMedia: !pass.deep,
              },
            ),
          );
          const row = findOpenWaHistoryMessage(history, externalId);
          if (!row) {
            continue;
          }

          const resolved = await this.resolveMediaFromOpenWaHistoryRow(
            baseUrl,
            apiKey,
            sessionId,
            row,
            chatId,
            downloadChats,
            messageId,
            conversationId,
          );
          if (resolved) {
            return resolved;
          }
        } catch (error) {
          throwIfOpenWaRateLimited(error);
          if (!isOpenWaTransientGatewayError(error)) {
            throw error;
          }
        }
      }
    }
    return null;
  }

  private async resolveMediaFromOpenWaHistoryRow(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    row: OpenWaHistoryMessage,
    fallbackChatId: string,
    downloadChats: string[],
    messageId: string,
    conversationId: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const media = row.media;
    const isVideo =
      (row.type?.toLowerCase() ?? '') === 'video' ||
      (media?.mimetype?.toLowerCase().startsWith('video/') ?? false);

    if (
      media &&
      !media.omitted &&
      typeof media.data === 'string' &&
      typeof media.mimetype === 'string'
    ) {
      const fromInline = readCachedMediaFromMetadata({
        data: media.data,
        mimetype: media.mimetype,
      });
      if (fromInline) {
        return fromInline;
      }
    }

    const rowChatId = row.chatId ?? fallbackChatId;
    for (const downloadChatId of downloadChats) {
      for (const openWaMessageId of buildOpenWaMediaMessageIdCandidates(
        row.id,
        {
          chatId: rowChatId,
          fromMe: row.fromMe,
          alternateChatIds: downloadChats,
        },
      )) {
        const fromOpenWa = await this.fetchOpenWaMessageMedia(
          baseUrl,
          apiKey,
          sessionId,
          downloadChatId,
          openWaMessageId,
          { isVideo },
        );
        if (fromOpenWa) {
          return fromOpenWa;
        }
      }
    }

    if (media?.mimetype && typeof media.mimetype === 'string') {
      await this.messageRepository.mergeMediaMetadata(
        messageId,
        conversationId,
        {
          mimetype: media.mimetype,
          ...(typeof media.sizeBytes === 'number'
            ? { sizeBytes: media.sizeBytes }
            : {}),
        },
      );
    }

    return null;
  }

  async listMessages(
    organizationId: string,
    userId: string,
    conversationId: string,
    limit = 50,
    offset = 0,
  ) {
    await this.requireConversationForUser(
      organizationId,
      userId,
      conversationId,
    );

    const [rows, total] = await this.messageRepository.findByConversation(
      conversationId,
      limit,
      offset,
    );

    return {
      items: rows.map((row) => ({
        id: row.id,
        externalId: row.externalId,
        fromMe: row.fromMe,
        body: row.body,
        messageType: row.messageType,
        mediaMetadata: stripInlineMediaDataForApi(row.mediaMetadata),
        sentAt: row.sentAt.toISOString(),
      })),
      total,
    };
  }

  async sendAttachment(
    organizationId: string,
    userId: string,
    conversationId: string,
    file: Express.Multer.File,
    caption?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A file upload is required');
    }

    const trimmedCaption = caption?.trim() || undefined;
    const mimetype = file.mimetype || 'application/octet-stream';
    const filename =
      file.originalname?.replace(/[^\w.\- ()[\]]+/g, '_').slice(0, 255) ||
      'file';

    const conversation = await this.requireConversationForUser(
      organizationId,
      userId,
      conversationId,
    );

    const senderConnectionId = conversation.senderConnectionId;
    if (!senderConnectionId) {
      throw new NotFoundException('Conversation not found');
    }

    const sender = await this.requireSenderConnection(
      organizationId,
      userId,
      senderConnectionId,
    );

    if (sender.status !== 'ready' || !sender.openwaSessionId) {
      throw new BadRequestException('WhatsApp sender is not ready');
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const sendPath = resolveOpenWaMediaSendPath(mimetype);
    const messageType = messageTypeFromMimetype(mimetype);
    const base64 = file.buffer.toString('base64');

    const response = await this.openWaClient.sendMedia(
      baseUrl,
      apiKey,
      sender.openwaSessionId,
      sendPath,
      {
        chatId: conversation.chatId,
        base64,
        mimetype,
        filename,
        caption: trimmedCaption,
      },
    );

    const preview = trimmedCaption || filename;

    const message = await this.persistence.upsertFromMediaSendResponse(
      conversation,
      {
        body: trimmedCaption ?? null,
        messageType,
        mediaMetadata: buildWhatsappMediaMetadata({
          filename,
          mimetype,
          inlineBase64: base64,
        }) ?? { filename, mimetype },
        preview,
      },
      response,
    );

    await this.cacheMessageMediaBytes(message.id, conversation.id, {
      buffer: file.buffer,
      contentType: mimetype,
    });

    return {
      id: message.id,
      externalId: message.externalId,
      fromMe: message.fromMe,
      body: message.body,
      messageType: message.messageType,
      mediaMetadata: stripInlineMediaDataForApi(message.mediaMetadata),
      sentAt: message.sentAt.toISOString(),
    };
  }

  async sendTextMessage(
    organizationId: string,
    userId: string,
    conversationId: string,
    text: string,
  ) {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message text is required');
    }

    const conversation = await this.requireConversationForUser(
      organizationId,
      userId,
      conversationId,
    );

    const senderConnectionId = conversation.senderConnectionId;
    if (!senderConnectionId) {
      throw new NotFoundException('Conversation not found');
    }

    const sender = await this.requireSenderConnection(
      organizationId,
      userId,
      senderConnectionId,
    );

    if (sender.status !== 'ready' || !sender.openwaSessionId) {
      throw new BadRequestException('WhatsApp sender is not ready');
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const response = await this.openWaClient.sendText(
      baseUrl,
      apiKey,
      sender.openwaSessionId,
      conversation.chatId,
      trimmed,
    );

    const message: WhatsappMessageEntity =
      await this.persistence.upsertFromSendResponse(
        conversation,
        trimmed,
        response,
      );

    return {
      id: message.id,
      externalId: message.externalId,
      fromMe: message.fromMe,
      body: message.body,
      messageType: message.messageType,
      mediaMetadata: stripInlineMediaDataForApi(message.mediaMetadata),
      sentAt: message.sentAt.toISOString(),
    };
  }

  private async requireSenderConnection(
    organizationId: string,
    userId: string,
    senderConnectionId: string,
  ) {
    const connection = await this.senderConnectionRepository.findByIdForUser(
      senderConnectionId,
      organizationId,
      userId,
    );
    if (!connection) {
      throw new NotFoundException('WhatsApp sender not found');
    }
    return connection;
  }

  private async requireConversationForUser(
    organizationId: string,
    userId: string,
    conversationId: string,
  ) {
    const conversation =
      await this.conversationRepository.findById(conversationId);

    if (!conversation?.senderConnectionId) {
      throw new NotFoundException('Conversation not found');
    }

    await this.requireSenderConnection(
      organizationId,
      userId,
      conversation.senderConnectionId,
    );

    return conversation;
  }
}
