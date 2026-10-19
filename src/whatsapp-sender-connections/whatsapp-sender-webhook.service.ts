import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { CredentialsCryptoService } from '../common/crypto/credentials-crypto.service';
import { OpenWaHttpClient } from '../inbox/whatsapp/openwa-http.client';
import { PlatformOpenWaService } from '../inbox/whatsapp/platform-openwa.service';
import { OPENWA_WEBHOOK_LOCAL_DEV_HINT } from '../inbox/whatsapp/utils/openwa-webhook-config.util';
import { verifyOpenWaWebhookSignature } from '../inbox/whatsapp/utils/openwa-webhook-signature.util';
import type { WhatsappConnectionStatus } from '../inbox/whatsapp/entities/user-whatsapp-connection.entity';
import { WhatsappBackfillService } from '../inbox/whatsapp/whatsapp-backfill.service';
import { WhatsappInboxPersistenceService } from '../inbox/whatsapp/whatsapp-inbox-persistence.service';
import { WhatsappInboxService } from '../inbox/whatsapp/whatsapp-inbox.service';
import { WhatsappSenderConnectionEntity } from './entities/whatsapp-sender-connection.entity';
import { WhatsappSenderConnectionRepository } from './whatsapp-sender-connection.repository';

interface OpenWaWebhookBody {
  event: string;
  sessionId: string;
  data: Record<string, unknown>;
}

@Injectable()
export class WhatsappSenderWebhookService {
  private readonly logger = new Logger(WhatsappSenderWebhookService.name);
  private campaignReplyHandler?: (
    senderConnectionId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;

  constructor(
    private readonly connectionRepository: WhatsappSenderConnectionRepository,
    private readonly credentialsCrypto: CredentialsCryptoService,
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    @Inject(forwardRef(() => WhatsappInboxPersistenceService))
    private readonly persistence: WhatsappInboxPersistenceService,
    @Inject(forwardRef(() => WhatsappBackfillService))
    private readonly backfillService: WhatsappBackfillService,
    @Inject(forwardRef(() => WhatsappInboxService))
    private readonly inboxService: WhatsappInboxService,
  ) {}

  registerCampaignReplyHandler(
    handler: (
      senderConnectionId: string,
      payload: Record<string, unknown>,
    ) => Promise<void>,
  ): void {
    this.campaignReplyHandler = handler;
  }

  async ensureWebhook(
    connection: WhatsappSenderConnectionEntity,
  ): Promise<void> {
    if (!connection.openwaSessionId) {
      return;
    }

    const webhookPath = `/webhooks/openwa/sender/${connection.id}`;
    const baseUrlCandidates =
      this.platformOpenWaService.resolveWebhookBaseUrlCandidates();
    const webhookEvents = [
      'message.received',
      'message.sent',
      'session.status',
    ];

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const secret = connection.webhookSecretEncrypted
      ? this.credentialsCrypto.decrypt<string>(
          connection.webhookSecretEncrypted,
        )
      : randomBytes(32).toString('hex');

    if (connection.openwaWebhookId && connection.webhookSecretEncrypted) {
      for (const webhookBase of baseUrlCandidates) {
        const webhookUrl = `${webhookBase}${webhookPath}`;
        try {
          await this.openWaClient.updateWebhook(
            baseUrl,
            apiKey,
            connection.openwaSessionId,
            connection.openwaWebhookId,
            {
              url: webhookUrl,
              secret,
              events: webhookEvents,
            },
          );
          connection.lastError = null;
          await this.connectionRepository.save(connection);
          return;
        } catch (error) {
          if (this.isMissingOpenWaWebhookError(error)) {
            connection.openwaWebhookId = null;
            break;
          }
          if (!this.isSsrfWebhookRejection(error)) {
            break;
          }
        }
      }
    }

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
            events: webhookEvents,
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
        if (!this.isSsrfWebhookRejection(error)) {
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
      `Sender webhook registration failed for ${connection.id}: ${message}`,
    );
  }

  async handleDelivery(
    connectionId: string,
    rawBody: string,
    signatureHeader: string | undefined,
    parsed: OpenWaWebhookBody,
  ): Promise<void> {
    const connection = await this.connectionRepository.findById(connectionId);
    if (!connection?.webhookSecretEncrypted) {
      throw new NotFoundException();
    }

    const secret = this.credentialsCrypto.decrypt<string>(
      connection.webhookSecretEncrypted,
    );

    if (!verifyOpenWaWebhookSignature(rawBody, signatureHeader, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (parsed.sessionId && connection.openwaSessionId !== parsed.sessionId) {
      throw new UnauthorizedException('Session mismatch');
    }

    if (parsed.event === 'session.status') {
      await this.handleSessionStatus(connection, parsed.data);
      return;
    }

    if (
      parsed.event === 'message.received' ||
      parsed.event === 'message.sent'
    ) {
      const upserted = await this.persistence.upsertFromWebhookPayloadForSender(
        connection.id,
        parsed.data,
      );

      if (upserted?.needsMediaPrefetch) {
        this.inboxService.prefetchInboundMessageMedia(
          upserted.conversationId,
          upserted.messageId,
        );
      }

      if (parsed.event === 'message.received') {
        const fromMe = Boolean(parsed.data.fromMe);
        if (!fromMe && this.campaignReplyHandler) {
          await this.campaignReplyHandler(connectionId, parsed.data);
        }
      }
    }
  }

  private async handleSessionStatus(
    connection: WhatsappSenderConnectionEntity,
    data: Record<string, unknown>,
  ): Promise<void> {
    const status = data.status;
    if (typeof status === 'string') {
      connection.status = status as WhatsappConnectionStatus;
    }

    const phone = data.phone;
    if (typeof phone === 'string') {
      connection.phone = phone;
    }

    const pushName = data.pushName;
    if (typeof pushName === 'string') {
      connection.pushName = pushName;
    }

    await this.connectionRepository.save(connection);

    if (connection.status === 'ready') {
      await this.ensureWebhook(connection);
      this.backfillService.enqueueSender(connection.id);
    }
  }

  private isSsrfWebhookRejection(error: unknown): boolean {
    return (
      error instanceof BadGatewayException &&
      error.message.includes('Destination address is not allowed')
    );
  }

  private isMissingOpenWaWebhookError(error: unknown): boolean {
    if (!(error instanceof BadGatewayException)) {
      return false;
    }
    const message = error.message.toLowerCase();
    return message.includes('(404)') || message.includes('not found');
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
