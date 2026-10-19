import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenWaHttpClient } from './openwa-http.client';
import { PlatformOpenWaService } from './platform-openwa.service';
import { buildOpenWaSessionName } from './utils/openwa-session-name.util';
import type { WhatsappConnectionStatus } from './entities/user-whatsapp-connection.entity';
import { WhatsappBackfillService } from './whatsapp-backfill.service';
import { WhatsappConnectionRepository } from './whatsapp-connection.repository';

export interface WhatsappConnectionView {
  id: string;
  status: WhatsappConnectionStatus;
  phone: string | null;
  pushName: string | null;
  lastBackfillAt: string | null;
  lastError: string | null;
  openWaAvailable: boolean;
}

export interface WhatsappQrView {
  status: WhatsappConnectionStatus;
  qrCode: string | null;
  phone: string | null;
  pushName: string | null;
}

@Injectable()
export class WhatsappConnectionService {
  constructor(
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly connectionRepository: WhatsappConnectionRepository,
    private readonly backfillService: WhatsappBackfillService,
  ) {}

  async getAvailability(): Promise<{ available: boolean }> {
    return this.platformOpenWaService.getAvailability();
  }

  async getConnection(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappConnectionView> {
    const availability = await this.platformOpenWaService.getAvailability();
    const connection = await this.connectionRepository.findByOrgAndUser(
      organizationId,
      userId,
    );

    if (!connection) {
      return {
        id: '',
        status: 'created',
        phone: null,
        pushName: null,
        lastBackfillAt: null,
        lastError: null,
        openWaAvailable: availability.available,
      };
    }

    await this.syncFromOpenWa(connection);

    return this.toView(connection, availability.available);
  }

  async startConnect(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappConnectionView> {
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const sessionName = buildOpenWaSessionName(organizationId, userId);
    let connection = await this.connectionRepository.findByOrgAndUser(
      organizationId,
      userId,
    );

    if (!connection) {
      connection = this.connectionRepository.create({
        organizationId,
        userId,
        openwaSessionName: sessionName,
      });
      await this.connectionRepository.save(connection);
    }

    let session = connection.openwaSessionId
      ? await this.openWaClient
          .getSession(baseUrl, apiKey, connection.openwaSessionId)
          .catch(() => null)
      : null;

    if (!session) {
      session =
        (await this.openWaClient.findSessionByName(
          baseUrl,
          apiKey,
          sessionName,
        )) ??
        (await this.openWaClient.createSession(baseUrl, apiKey, sessionName));
    }

    connection.openwaSessionId = session.id;
    connection.openwaSessionName = session.name;
    connection.status = session.status as WhatsappConnectionStatus;
    connection.phone = session.phone ?? null;
    connection.pushName = session.pushName ?? null;
    connection.lastError = session.lastError ?? null;

    if (session.status !== 'ready') {
      session = await this.openWaClient.startSession(
        baseUrl,
        apiKey,
        session.id,
      );
      connection.status = session.status as WhatsappConnectionStatus;
    }

    await this.connectionRepository.save(connection);

    if (connection.status === 'ready') {
      await this.backfillService.ensureWebhook(connection);
      this.backfillService.enqueue(connection.id);
    }

    return this.toView(connection, true);
  }

  async getQr(organizationId: string, userId: string): Promise<WhatsappQrView> {
    const connection = await this.requireConnection(organizationId, userId);
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    if (!connection.openwaSessionId) {
      return {
        status: connection.status,
        qrCode: null,
        phone: connection.phone,
        pushName: connection.pushName,
      };
    }

    await this.syncFromOpenWa(connection);

    if (connection.status === 'ready') {
      await this.backfillService.ensureWebhook(connection);
      this.backfillService.enqueue(connection.id);
      return {
        status: connection.status,
        qrCode: null,
        phone: connection.phone,
        pushName: connection.pushName,
      };
    }

    const qr = await this.openWaClient.getQrCode(
      baseUrl,
      apiKey,
      connection.openwaSessionId,
    );

    if (qr) {
      connection.status = qr.status as WhatsappConnectionStatus;
      await this.connectionRepository.save(connection);
    }

    return {
      status: connection.status,
      qrCode: qr?.qrCode ?? null,
      phone: connection.phone,
      pushName: connection.pushName,
    };
  }

  async disconnect(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappConnectionView> {
    const connection = await this.requireConnection(organizationId, userId);
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    if (connection.openwaSessionId) {
      try {
        const session = await this.openWaClient.logoutSession(
          baseUrl,
          apiKey,
          connection.openwaSessionId,
        );
        connection.status = session.status as WhatsappConnectionStatus;
        connection.phone = session.phone ?? null;
        connection.pushName = session.pushName ?? null;
      } catch {
        connection.status = 'disconnected';
      }
    }

    connection.openwaWebhookId = null;
    connection.webhookSecretEncrypted = null;
    await this.connectionRepository.save(connection);

    return this.toView(connection, true);
  }

  private async requireConnection(organizationId: string, userId: string) {
    const connection = await this.connectionRepository.findByOrgAndUser(
      organizationId,
      userId,
    );
    if (!connection) {
      throw new NotFoundException('WhatsApp connection not found');
    }
    return connection;
  }

  private async syncFromOpenWa(
    connection: Awaited<
      ReturnType<WhatsappConnectionRepository['findByOrgAndUser']>
    >,
  ): Promise<void> {
    if (!connection?.openwaSessionId) {
      return;
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const session = await this.openWaClient.getSession(
      baseUrl,
      apiKey,
      connection.openwaSessionId,
    );

    const previousStatus = connection.status;
    connection.status = session.status as WhatsappConnectionStatus;
    connection.phone = session.phone ?? null;
    connection.pushName = session.pushName ?? null;
    connection.lastError = session.lastError ?? null;
    await this.connectionRepository.save(connection);

    if (connection.status === 'ready' && previousStatus !== 'ready') {
      await this.backfillService.ensureWebhook(connection);
      this.backfillService.enqueue(connection.id);
    }
  }

  private toView(
    connection: NonNullable<
      Awaited<ReturnType<WhatsappConnectionRepository['findByOrgAndUser']>>
    >,
    openWaAvailable: boolean,
  ): WhatsappConnectionView {
    return {
      id: connection.id,
      status: connection.status,
      phone: connection.phone,
      pushName: connection.pushName,
      lastBackfillAt: connection.lastBackfillAt?.toISOString() ?? null,
      lastError: connection.lastError,
      openWaAvailable,
    };
  }
}
