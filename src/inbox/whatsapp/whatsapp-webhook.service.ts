import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { CredentialsCryptoService } from '../../common/crypto/credentials-crypto.service';
import { verifyOpenWaWebhookSignature } from './utils/openwa-webhook-signature.util';
import { WhatsappBackfillService } from './whatsapp-backfill.service';
import { WhatsappConnectionRepository } from './whatsapp-connection.repository';
import { WhatsappInboxPersistenceService } from './whatsapp-inbox-persistence.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import type { WhatsappConnectionStatus } from './entities/user-whatsapp-connection.entity';
import { WhatsappCampaignInboundDispatchService } from '../../whatsapp-campaigns/whatsapp-campaign-inbound-dispatch.service';

interface OpenWaWebhookBody {
  event: string;
  sessionId: string;
  data: Record<string, unknown>;
}

@Injectable()
export class WhatsappWebhookService {
  constructor(
    private readonly connectionRepository: WhatsappConnectionRepository,
    private readonly credentialsCrypto: CredentialsCryptoService,
    private readonly persistence: WhatsappInboxPersistenceService,
    private readonly backfillService: WhatsappBackfillService,
    private readonly campaignInboundDispatch: WhatsappCampaignInboundDispatchService,
    private readonly inboxService: WhatsappInboxService,
  ) {}

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
      const upserted = await this.persistence.upsertFromWebhookPayload(
        connection.id,
        parsed.data,
      );

      if (upserted?.needsMediaPrefetch) {
        this.inboxService.prefetchInboundMessageMedia(
          upserted.conversationId,
          upserted.messageId,
        );
      }

      if (parsed.event === 'message.received' && parsed.sessionId) {
        await this.campaignInboundDispatch.dispatchByOpenWaSessionId(
          parsed.sessionId,
          parsed.data,
        );
      }
    }
  }

  private async handleSessionStatus(
    connection: Awaited<ReturnType<WhatsappConnectionRepository['findById']>>,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!connection) {
      return;
    }

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
      await this.backfillService.ensureWebhook(connection);
      this.backfillService.enqueue(connection.id);
    }
  }
}
