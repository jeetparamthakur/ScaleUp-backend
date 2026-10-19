import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CredentialsCryptoService } from '../../common/crypto/credentials-crypto.service';
import { OpenWaHttpClient, type OpenWaChatSummary } from './openwa-http.client';
import { PlatformOpenWaService } from './platform-openwa.service';
import { OPENWA_WEBHOOK_LOCAL_DEV_HINT } from './utils/openwa-webhook-config.util';
import type { UserWhatsappConnectionEntity } from './entities/user-whatsapp-connection.entity';
import { WhatsappSenderConnectionRepository } from '../../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import type { WhatsappConversationEntity } from './entities/whatsapp-conversation.entity';
import { WhatsappConnectionRepository } from './whatsapp-connection.repository';
import { WhatsappInboxPersistenceService } from './whatsapp-inbox-persistence.service';
import { WhatsappConversationContactResolverService } from './whatsapp-conversation-contact-resolver.service';
import type { WhatsappSenderConnectionEntity } from '../../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';

const INCREMENTAL_SYNC_MIN_INTERVAL_MS = 20_000;
const INCREMENTAL_SYNC_MAX_CHATS = 25;
const INCREMENTAL_SYNC_CHAT_DELAY_MS = 120;

@Injectable()
export class WhatsappBackfillService {
  private readonly logger = new Logger(WhatsappBackfillService.name);
  private readonly running = new Set<string>();
  private readonly incrementalSyncAt = new Map<string, number>();

  constructor(
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly connectionRepository: WhatsappConnectionRepository,
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
    private readonly persistence: WhatsappInboxPersistenceService,
    private readonly contactResolver: WhatsappConversationContactResolverService,
    private readonly credentialsCrypto: CredentialsCryptoService,
  ) {}

  enqueue(connectionId: string): void {
    const key = `user:${connectionId}`;
    if (this.running.has(key)) {
      return;
    }

    this.running.add(key);
    void this.runUserBackfill(connectionId)
      .catch((error) => {
        this.logger.error(
          `WhatsApp backfill failed for connection ${connectionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        this.running.delete(key);
      });
  }

  /**
   * Light-weight pull for inbox UI: recent chats + optional priority thread. Throttled and
   * deduplicated; failures are logged at debug/warn without surfacing to the client.
   */
  async syncSenderIncremental(
    senderConnectionId: string,
    options?: { priorityChatIds?: string[] },
  ): Promise<void> {
    const throttleKey = senderConnectionId;
    const now = Date.now();
    const last = this.incrementalSyncAt.get(throttleKey) ?? 0;
    if (now - last < INCREMENTAL_SYNC_MIN_INTERVAL_MS) {
      return;
    }

    const runKey = `incremental:${senderConnectionId}`;
    if (this.running.has(runKey)) {
      return;
    }

    this.running.add(runKey);
    try {
      const connection =
        await this.senderConnectionRepository.findById(senderConnectionId);
      if (!connection?.openwaSessionId || connection.status !== 'ready') {
        return;
      }

      await this.runIncrementalSenderSync(connection, options?.priorityChatIds);
      this.incrementalSyncAt.set(throttleKey, Date.now());
    } catch (error) {
      this.logger.debug(
        `Incremental WhatsApp sync skipped for sender ${senderConnectionId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      this.running.delete(runKey);
    }
  }

  enqueueSender(senderConnectionId: string): void {
    const key = `sender:${senderConnectionId}`;
    if (this.running.has(key)) {
      return;
    }

    this.running.add(key);
    void this.runSenderBackfill(senderConnectionId)
      .catch((error) => {
        this.logger.error(
          `WhatsApp sender backfill failed for ${senderConnectionId}`,
          error instanceof Error ? error.stack : String(error),
        );
      })
      .finally(() => {
        this.running.delete(key);
      });
  }

  private async runUserBackfill(connectionId: string): Promise<void> {
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection?.openwaSessionId) {
      return;
    }

    await this.runBackfillForSession(
      connection.openwaSessionId,
      async (chat) => {
        const title = await this.contactResolver.resolveTitleForChat(
          connection.openwaSessionId!,
          chat.id,
          chat.name,
          chat.isGroup,
        );
        return this.persistence.ensureConversation(
          connection.id,
          chat.id,
          title,
          chat.isGroup,
          chat.lastMessage ?? null,
          chat.timestamp,
          chat.unreadCount,
        );
      },
    );

    connection.lastBackfillAt = new Date();
    connection.lastError = null;
    await this.connectionRepository.save(connection);
  }

  private async runSenderBackfill(senderConnectionId: string): Promise<void> {
    const connection =
      await this.senderConnectionRepository.findById(senderConnectionId);
    if (!connection?.openwaSessionId) {
      return;
    }

    await this.runBackfillForSession(
      connection.openwaSessionId,
      async (chat) => {
        const title = await this.contactResolver.resolveTitleForChat(
          connection.openwaSessionId!,
          chat.id,
          chat.name,
          chat.isGroup,
        );
        return this.persistence.ensureConversationForSender(
          connection.id,
          chat.id,
          title,
          chat.isGroup,
          chat.lastMessage ?? null,
          chat.timestamp,
          chat.unreadCount,
        );
      },
    );

    connection.lastBackfillAt = new Date();
    connection.lastError = null;
    await this.senderConnectionRepository.save(connection);
  }

  private async runIncrementalSenderSync(
    connection: WhatsappSenderConnectionEntity,
    priorityChatIds: string[] = [],
  ): Promise<void> {
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();
    const sessionId = connection.openwaSessionId!;
    const synced = new Set<string>();

    for (const chatId of priorityChatIds) {
      const trimmed = chatId.trim();
      if (!trimmed || synced.has(trimmed)) {
        continue;
      }
      await this.syncSenderChatHistory(connection, sessionId, trimmed, 80);
      synced.add(trimmed);
    }

    const chats = await this.openWaClient.listChats(
      baseUrl,
      apiKey,
      sessionId,
      40,
      0,
    );

    for (const chat of chats) {
      if (synced.has(chat.id)) {
        continue;
      }
      if (synced.size >= INCREMENTAL_SYNC_MAX_CHATS) {
        break;
      }
      await this.syncSenderChatHistory(
        connection,
        sessionId,
        chat.id,
        35,
        chat,
      );
      synced.add(chat.id);
      await new Promise((resolve) =>
        setTimeout(resolve, INCREMENTAL_SYNC_CHAT_DELAY_MS),
      );
    }
  }

  private async syncSenderChatHistory(
    connection: WhatsappSenderConnectionEntity,
    openwaSessionId: string,
    chatId: string,
    historyLimit: number,
    chatSummary?: OpenWaChatSummary,
  ): Promise<void> {
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const isGroup = chatId.endsWith('@g.us');
    const title = await this.contactResolver.resolveTitleForChat(
      openwaSessionId,
      chatId,
      chatSummary?.name ?? '',
      isGroup,
    );

    const conversation = await this.persistence.ensureConversationForSender(
      connection.id,
      chatId,
      title,
      isGroup,
      chatSummary?.lastMessage ?? null,
      chatSummary?.timestamp,
      chatSummary?.unreadCount ?? 0,
    );

    try {
      const history = await this.openWaClient.getChatHistory(
        baseUrl,
        apiKey,
        openwaSessionId,
        chatId,
        {
          limit: historyLimit,
          deep: historyLimit > 50,
          includeMedia: false,
        },
      );

      for (const message of history) {
        await this.persistence.upsertFromHistoryMessage(conversation, message);
      }
    } catch (error) {
      this.logger.warn(
        `Incremental sync skipped chat ${chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async runBackfillForSession(
    openwaSessionId: string,
    ensureConversation: (
      chat: OpenWaChatSummary,
    ) => Promise<WhatsappConversationEntity>,
  ): Promise<void> {
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    let offset = 0;
    const pageSize = 200;

    for (;;) {
      const chats = await this.openWaClient.listChats(
        baseUrl,
        apiKey,
        openwaSessionId,
        pageSize,
        offset,
      );

      if (chats.length === 0) {
        break;
      }

      for (const chat of chats) {
        const conversation = await ensureConversation(chat);

        try {
          const history = await this.openWaClient.getChatHistory(
            baseUrl,
            apiKey,
            openwaSessionId,
            chat.id,
            { limit: 2000, deep: true, includeMedia: false },
          );

          for (const message of history) {
            await this.persistence.upsertFromHistoryMessage(
              conversation,
              message,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Skipped history for chat ${chat.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (chats.length < pageSize) {
        break;
      }

      offset += pageSize;
    }
  }

  async ensureWebhook(connection: UserWhatsappConnectionEntity): Promise<void> {
    if (!connection.openwaSessionId) {
      return;
    }

    if (connection.openwaWebhookId && connection.webhookSecretEncrypted) {
      return;
    }

    const secret = randomBytes(32).toString('hex');
    const webhookPath = `/webhooks/openwa/${connection.id}`;
    const baseUrlCandidates =
      this.platformOpenWaService.resolveWebhookBaseUrlCandidates();

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    let lastError: unknown;
    let lastWebhookUrl = '';

    for (const webhookBase of baseUrlCandidates) {
      const webhookUrl = `${webhookBase}${webhookPath}`;
      lastWebhookUrl = webhookUrl;

      try {
        const webhook = await this.openWaClient.createWebhook(
          baseUrl,
          apiKey,
          connection.openwaSessionId,
          {
            url: webhookUrl,
            secret,
            events: ['message.received', 'message.sent', 'session.status'],
          },
        );

        connection.openwaWebhookId = webhook.id;
        connection.webhookSecretEncrypted =
          this.credentialsCrypto.encrypt(secret);
        connection.lastError = null;
        await this.connectionRepository.save(connection);
        return;
      } catch (error) {
        lastError = error;
        if (!(
          error instanceof BadGatewayException &&
          error.message.includes('Destination address is not allowed')
        )) {
          break;
        }
      }
    }

    const message = this.formatWebhookRegistrationError(
      lastError,
      lastWebhookUrl,
    );
    connection.lastError = message;
    await this.connectionRepository.save(connection);
    this.logger.warn(
      `OpenWA webhook registration failed for connection ${connection.id}: ${message}`,
    );
  }

  private formatWebhookRegistrationError(
    error: unknown,
    webhookUrl: string,
  ): string {
    if (
      error instanceof BadGatewayException &&
      error.message.includes('Destination address is not allowed')
    ) {
      return (
        `Webhook URL is not reachable from OpenWA (${webhookUrl}). ` +
        OPENWA_WEBHOOK_LOCAL_DEV_HINT
      );
    }

    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
