import { Injectable, NotFoundException } from '@nestjs/common';
import { OpenWaHttpClient } from '../inbox/whatsapp/openwa-http.client';
import { PlatformOpenWaService } from '../inbox/whatsapp/platform-openwa.service';
import type { WhatsappConnectionStatus } from '../inbox/whatsapp/entities/user-whatsapp-connection.entity';
import { buildOpenWaCampaignSessionName } from '../inbox/whatsapp/utils/openwa-session-name.util';
import { WhatsappSenderConnectionEntity } from './entities/whatsapp-sender-connection.entity';
import { WhatsappSenderConnectionRepository } from './whatsapp-sender-connection.repository';
import { WhatsappBackfillService } from '../inbox/whatsapp/whatsapp-backfill.service';
import { WhatsappSenderWebhookService } from './whatsapp-sender-webhook.service';
import {
  applySenderDailyReset,
  getSenderRemainingDailyCapacity,
} from './utils/sender-daily.util';

export interface WhatsappSenderConnectionView {
  id: string;
  displayName: string | null;
  status: WhatsappConnectionStatus;
  phone: string | null;
  pushName: string | null;
  lastError: string | null;
  openWaAvailable: boolean;
  createdAt: string;
  dailySendLimit: number | null;
  sendsTodayCount: number;
  remainingDailyCapacity: number | null;
}

export interface WhatsappSenderQrView {
  status: WhatsappConnectionStatus;
  qrCode: string | null;
  phone: string | null;
  pushName: string | null;
}

@Injectable()
export class WhatsappSenderConnectionService {
  /** Dedupes in-flight OpenWA POST /start kicks triggered from QR polling. */
  private readonly openWaSessionStartInFlight = new Set<string>();

  constructor(
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly connectionRepository: WhatsappSenderConnectionRepository,
    private readonly senderWebhookService: WhatsappSenderWebhookService,
    private readonly backfillService: WhatsappBackfillService,
  ) {}

  async updateConnection(
    organizationId: string,
    userId: string,
    connectionId: string,
    input: { displayName?: string; dailySendLimit?: number | null },
  ): Promise<WhatsappSenderConnectionView> {
    const connection = await this.requireConnection(
      organizationId,
      userId,
      connectionId,
    );

    if (input.displayName !== undefined) {
      connection.displayName = input.displayName.trim() || null;
    }

    if (input.dailySendLimit !== undefined) {
      connection.dailySendLimit = input.dailySendLimit;
    }

    await this.connectionRepository.save(connection);
    const availability = await this.platformOpenWaService.getAvailability();
    return this.toView(connection, availability.available);
  }

  async getAvailability(): Promise<{ available: boolean }> {
    return this.platformOpenWaService.getAvailability();
  }

  async listConnections(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappSenderConnectionView[]> {
    const availability = await this.platformOpenWaService.getAvailability();
    const connections = await this.connectionRepository.listByOrgAndUser(
      organizationId,
      userId,
    );

    for (const connection of connections) {
      await this.syncFromOpenWa(connection);
    }

    const refreshed = await this.connectionRepository.listByOrgAndUser(
      organizationId,
      userId,
    );

    return refreshed.map((row) => this.toView(row, availability.available));
  }

  async getConnection(
    organizationId: string,
    userId: string,
    connectionId: string,
  ): Promise<WhatsappSenderConnectionView> {
    const availability = await this.platformOpenWaService.getAvailability();
    const connection = await this.requireConnection(
      organizationId,
      userId,
      connectionId,
    );

    await this.syncFromOpenWa(connection);

    const refreshed = await this.requireConnection(
      organizationId,
      userId,
      connectionId,
    );

    return this.toView(refreshed, availability.available);
  }

  async createAndStartConnect(
    organizationId: string,
    userId: string,
    displayName?: string,
  ): Promise<WhatsappSenderConnectionView> {
    const availability = await this.platformOpenWaService.getAvailability();
    if (!availability.available) {
      await this.platformOpenWaService.resolveCredentials();
    }

    let connection = this.connectionRepository.create({
      organizationId,
      userId,
      displayName: displayName?.trim() || null,
      openwaSessionName: 'pending',
    });
    connection = await this.connectionRepository.save(connection);

    connection.openwaSessionName = buildOpenWaCampaignSessionName(
      organizationId,
      userId,
      connection.id,
    );
    await this.connectionRepository.save(connection);

    return this.toView(connection, availability.available);
  }

  async startConnect(
    organizationId: string,
    userId: string,
    connectionId: string,
  ): Promise<WhatsappSenderConnectionView> {
    const prepared = await this.prepareOpenWaSession(
      organizationId,
      userId,
      connectionId,
    );
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();
    this.kickstartOpenWaSessionIfNeeded(baseUrl, apiKey, prepared);
    return this.toView(prepared, true);
  }

  async getQr(
    organizationId: string,
    userId: string,
    connectionId: string,
  ): Promise<WhatsappSenderQrView> {
    let connection = await this.requireConnection(
      organizationId,
      userId,
      connectionId,
    );
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    if (!connection.openwaSessionId) {
      connection = await this.prepareOpenWaSession(
        organizationId,
        userId,
        connectionId,
      );
    }

    if (connection.status === 'ready') {
      await this.syncFromOpenWa(connection);
      const refreshed = await this.requireConnection(
        organizationId,
        userId,
        connectionId,
      );
      await this.senderWebhookService.ensureWebhook(refreshed);
      return {
        status: refreshed.status,
        qrCode: null,
        phone: refreshed.phone,
        pushName: refreshed.pushName,
      };
    }

    const sessionId = connection.openwaSessionId;
    if (!sessionId) {
      return {
        status: connection.status,
        qrCode: null,
        phone: connection.phone,
        pushName: connection.pushName,
      };
    }

    this.kickstartOpenWaSessionIfNeeded(baseUrl, apiKey, connection);

    const qr = await this.openWaClient.getQrCode(baseUrl, apiKey, sessionId);

    if (qr) {
      connection.status = qr.status as WhatsappConnectionStatus;
      connection.lastError = null;
      await this.connectionRepository.save(connection);
      if (connection.status === 'ready') {
        await this.senderWebhookService.ensureWebhook(connection);
      }
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
    connectionId: string,
  ): Promise<{ deleted: true }> {
    const connection = await this.requireConnection(
      organizationId,
      userId,
      connectionId,
    );

    let baseUrl: string | null = null;
    let apiKey: string | null = null;
    try {
      const credentials = await this.platformOpenWaService.resolveCredentials();
      baseUrl = credentials.baseUrl;
      apiKey = credentials.apiKey;
    } catch {
      // OpenWA unavailable — still remove the local connection row
    }

    if (connection.openwaSessionId && baseUrl && apiKey) {
      try {
        await this.openWaClient.logoutSession(
          baseUrl,
          apiKey,
          connection.openwaSessionId,
        );
      } catch {
        // Best-effort logout before session removal
      }

      try {
        await this.openWaClient.deleteSession(
          baseUrl,
          apiKey,
          connection.openwaSessionId,
        );
      } catch {
        // Still remove local row if OpenWA session is already gone
      }
    }

    await this.connectionRepository.remove(connection);

    return { deleted: true };
  }

  private async prepareOpenWaSession(
    organizationId: string,
    userId: string,
    connectionId: string,
  ): Promise<WhatsappSenderConnectionEntity> {
    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const connection = await this.requireConnection(
      organizationId,
      userId,
      connectionId,
    );

    const sessionName = connection.openwaSessionName;

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

    await this.connectionRepository.save(connection);

    if (connection.status === 'ready') {
      await this.senderWebhookService.ensureWebhook(connection);
    }

    return connection;
  }

  private kickstartOpenWaSessionIfNeeded(
    baseUrl: string,
    apiKey: string,
    connection: WhatsappSenderConnectionEntity,
  ): void {
    const sessionId = connection.openwaSessionId;
    if (!sessionId || connection.status === 'ready') {
      return;
    }
    if (this.openWaSessionStartInFlight.has(sessionId)) {
      return;
    }

    this.openWaSessionStartInFlight.add(sessionId);

    void (async () => {
      try {
        const session = await this.openWaClient.startSession(
          baseUrl,
          apiKey,
          sessionId,
        );
        connection.status = session.status as WhatsappConnectionStatus;
        connection.phone = session.phone ?? null;
        connection.pushName = session.pushName ?? null;
        connection.lastError = session.lastError ?? null;
        await this.connectionRepository.save(connection);
        if (connection.status === 'ready') {
          await this.senderWebhookService.ensureWebhook(connection);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'OpenWA start failed';
        connection.lastError = message;
        await this.connectionRepository.save(connection);
      } finally {
        this.openWaSessionStartInFlight.delete(sessionId);
      }
    })();
  }

  private async requireConnection(
    organizationId: string,
    userId: string,
    connectionId: string,
  ): Promise<WhatsappSenderConnectionEntity> {
    const connection = await this.connectionRepository.findByIdForUser(
      connectionId,
      organizationId,
      userId,
    );
    if (!connection) {
      throw new NotFoundException('WhatsApp sender connection not found');
    }
    return connection;
  }

  private async syncFromOpenWa(
    connection: WhatsappSenderConnectionEntity,
  ): Promise<void> {
    if (!connection.openwaSessionId) {
      return;
    }

    try {
      const { baseUrl, apiKey } =
        await this.platformOpenWaService.resolveCredentials();

      const session = await this.openWaClient.getSession(
        baseUrl,
        apiKey,
        connection.openwaSessionId,
      );

      connection.status = session.status as WhatsappConnectionStatus;
      connection.phone = session.phone ?? null;
      connection.pushName = session.pushName ?? null;
      connection.lastError = session.lastError ?? null;
      await this.connectionRepository.save(connection);

      if (connection.status === 'ready') {
        await this.senderWebhookService.ensureWebhook(connection);
        if (!connection.lastBackfillAt) {
          this.backfillService.enqueueSender(connection.id);
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'OpenWA sync failed';
      const lower = message.toLowerCase();
      if (lower.includes('404') || lower.includes('not found')) {
        connection.status = 'disconnected';
        connection.lastError =
          'WhatsApp session no longer exists. Reconnect to scan a new QR code.';
      } else {
        connection.lastError = message;
      }
      await this.connectionRepository.save(connection);
    }
  }

  private toView(
    connection: WhatsappSenderConnectionEntity,
    openWaAvailable: boolean,
  ): WhatsappSenderConnectionView {
    const now = new Date();
    applySenderDailyReset(connection, now);
    return {
      id: connection.id,
      displayName: connection.displayName,
      status: connection.status,
      phone: connection.phone,
      pushName: connection.pushName,
      lastError: connection.lastError,
      openWaAvailable,
      createdAt: connection.createdAt.toISOString(),
      dailySendLimit: connection.dailySendLimit,
      sendsTodayCount: connection.sendsTodayCount,
      remainingDailyCapacity: getSenderRemainingDailyCapacity(connection, now),
    };
  }
}
