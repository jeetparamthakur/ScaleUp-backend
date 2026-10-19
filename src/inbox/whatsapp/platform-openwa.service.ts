import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CredentialsCryptoService } from '../../common/crypto/credentials-crypto.service';
import { OpenWaHttpClient } from './openwa-http.client';
import { PlatformOpenWaRepository } from './platform-openwa.repository';
import type { UpdatePlatformOpenWaSettingsDto } from './dto/platform-openwa.dto';
import {
  buildOpenWaWebhookBaseUrlCandidates,
  resolveEffectiveOpenWaWebhookBaseUrl,
} from './utils/openwa-webhook-config.util';

export interface PlatformOpenWaSettingsView {
  configured: boolean;
  enabled: boolean;
  baseUrl: string;
  updatedAt: string;
}

@Injectable()
export class PlatformOpenWaService {
  constructor(
    private readonly repository: PlatformOpenWaRepository,
    private readonly credentialsCrypto: CredentialsCryptoService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly config: ConfigService,
  ) {}

  async getSettings(): Promise<PlatformOpenWaSettingsView> {
    const row = await this.repository.getOrCreate();
    return {
      configured: Boolean(row.apiKeyEncrypted && row.baseUrl.trim()),
      enabled: row.enabled,
      baseUrl: row.baseUrl,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getAvailability(): Promise<{ available: boolean }> {
    const row = await this.repository.getOrCreate();
    return {
      available:
        row.enabled && Boolean(row.apiKeyEncrypted && row.baseUrl.trim()),
    };
  }

  async updateSettings(
    dto: UpdatePlatformOpenWaSettingsDto,
  ): Promise<PlatformOpenWaSettingsView> {
    const row = await this.repository.getOrCreate();

    if (dto.baseUrl !== undefined) {
      row.baseUrl = dto.baseUrl.trim();
    }

    if (dto.enabled !== undefined) {
      row.enabled = dto.enabled;
    }

    if (dto.apiKey !== undefined) {
      const trimmed = dto.apiKey.trim();
      row.apiKeyEncrypted = trimmed
        ? this.credentialsCrypto.encrypt(trimmed)
        : null;
    }

    if (row.enabled && (!row.baseUrl.trim() || !row.apiKeyEncrypted)) {
      throw new BadRequestException(
        'Enable OpenWA only after setting base URL and API key',
      );
    }

    await this.repository.save(row);
    return this.getSettings();
  }

  async testConnection(): Promise<{ ok: true }> {
    const { baseUrl, apiKey } = await this.resolveCredentials();
    await this.openWaClient.testConnection(baseUrl, apiKey);
    return { ok: true };
  }

  async resolveCredentials(): Promise<{ baseUrl: string; apiKey: string }> {
    const row = await this.repository.getOrCreate();

    if (!row.enabled || !row.baseUrl.trim() || !row.apiKeyEncrypted) {
      throw new ServiceUnavailableException('OpenWA is not configured');
    }

    let apiKey: string;
    try {
      apiKey = this.credentialsCrypto.decrypt<string>(row.apiKeyEncrypted);
    } catch {
      throw new ServiceUnavailableException(
        'OpenWA API key could not be decrypted. Re-save the API key in platform OpenWA settings.',
      );
    }

    return { baseUrl: row.baseUrl, apiKey };
  }

  resolveWebhookBaseUrl(): string {
    return resolveEffectiveOpenWaWebhookBaseUrl({
      openwaWebhookBaseUrl: this.config.get<string>('openwaWebhookBaseUrl'),
      backendUrl: this.config.get<string>('backendUrl'),
      trackingBaseUrl: this.config.get<string>('trackingBaseUrl'),
      defaultPort: this.config.get<number>('port') ?? 3008,
    });
  }

  resolveWebhookBaseUrlCandidates(): string[] {
    return buildOpenWaWebhookBaseUrlCandidates({
      openwaWebhookBaseUrl: this.config.get<string>('openwaWebhookBaseUrl'),
      backendUrl: this.config.get<string>('backendUrl'),
      trackingBaseUrl: this.config.get<string>('trackingBaseUrl'),
      defaultPort: this.config.get<number>('port') ?? 3008,
    });
  }
}
