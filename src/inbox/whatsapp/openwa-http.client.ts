import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';

export interface OpenWaSessionResponse {
  id: string;
  name: string;
  status: string;
  phone?: string | null;
  pushName?: string | null;
  connectedAt?: string | null;
  lastError?: string | null;
}

export interface OpenWaQrResponse {
  qrCode: string;
  status: string;
}

export interface OpenWaChatSummary {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  timestamp: number;
  lastMessage?: string;
}

export interface OpenWaContact {
  id: string;
  name?: string;
  pushName?: string;
  number: string;
  isMyContact?: boolean;
}

export interface OpenWaHistoryMessageMedia {
  mimetype?: string;
  filename?: string;
  data?: string;
  omitted?: boolean;
  sizeBytes?: number;
}

export interface OpenWaHistoryMessage {
  id: string;
  chatId: string;
  body: string;
  type: string;
  timestamp: number;
  fromMe: boolean;
  media?: OpenWaHistoryMessageMedia;
}

export interface OpenWaWebhookResponse {
  id: string;
  url: string;
  events: string[];
}

export interface OpenWaSendTextResponse {
  messageId: string;
  timestamp: number;
}

export interface OpenWaSendMediaRequest {
  chatId: string;
  base64: string;
  mimetype: string;
  filename?: string;
  caption?: string;
}

@Injectable()
export class OpenWaHttpClient {
  async testConnection(baseUrl: string, apiKey: string): Promise<void> {
    await this.request(baseUrl, apiKey, 'GET', '/sessions?limit=1');
  }

  async findSessionByName(
    baseUrl: string,
    apiKey: string,
    name: string,
  ): Promise<OpenWaSessionResponse | null> {
    const sessions = await this.request<OpenWaSessionResponse[]>(
      baseUrl,
      apiKey,
      'GET',
      `/sessions?name=${encodeURIComponent(name)}`,
    );
    return sessions[0] ?? null;
  }

  async createSession(
    baseUrl: string,
    apiKey: string,
    name: string,
  ): Promise<OpenWaSessionResponse> {
    return this.request<OpenWaSessionResponse>(
      baseUrl,
      apiKey,
      'POST',
      '/sessions',
      {
        name,
      },
    );
  }

  async getSession(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
  ): Promise<OpenWaSessionResponse> {
    return this.request<OpenWaSessionResponse>(
      baseUrl,
      apiKey,
      'GET',
      `/sessions/${sessionId}`,
    );
  }

  async startSession(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
  ): Promise<OpenWaSessionResponse> {
    try {
      return await this.request<OpenWaSessionResponse>(
        baseUrl,
        apiKey,
        'POST',
        `/sessions/${sessionId}/start`,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        const message = error.message.toLowerCase();
        if (
          message.includes('(400)') &&
          (message.includes('already started') ||
            message.includes('already starting'))
        ) {
          return this.getSession(baseUrl, apiKey, sessionId);
        }
      }
      throw error;
    }
  }

  async getQrCode(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
  ): Promise<OpenWaQrResponse | null> {
    try {
      return await this.request<OpenWaQrResponse>(
        baseUrl,
        apiKey,
        'GET',
        `/sessions/${sessionId}/qr`,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        const message = error.message.toLowerCase();
        if (message.includes('404') || message.includes('not ready')) {
          return null;
        }
      }
      throw error;
    }
  }

  async logoutSession(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
  ): Promise<OpenWaSessionResponse> {
    return this.request<OpenWaSessionResponse>(
      baseUrl,
      apiKey,
      'POST',
      `/sessions/${sessionId}/logout`,
    );
  }

  async deleteSession(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
  ): Promise<void> {
    await this.request<void>(
      baseUrl,
      apiKey,
      'DELETE',
      `/sessions/${sessionId}`,
    );
  }

  async getContact(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    contactId: string,
  ): Promise<OpenWaContact | null> {
    try {
      return await this.request<OpenWaContact>(
        baseUrl,
        apiKey,
        'GET',
        `/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}`,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) {
        const message = error.message.toLowerCase();
        if (message.includes('404') || message.includes('not found')) {
          return null;
        }
      }
      throw error;
    }
  }

  async resolveContactPhone(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    contactId: string,
  ): Promise<string | null> {
    try {
      const response = await this.request<{ phone: string | null }>(
        baseUrl,
        apiKey,
        'GET',
        `/sessions/${sessionId}/contacts/${encodeURIComponent(contactId)}/phone`,
      );
      return response.phone;
    } catch {
      return null;
    }
  }

  async getProfilePictures(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    contactIds: string[],
  ): Promise<{ pictures: Record<string, string | null> }> {
    if (contactIds.length === 0) {
      return { pictures: {} };
    }
    const ids = contactIds.slice(0, 50).join(',');
    return this.request<{ pictures: Record<string, string | null> }>(
      baseUrl,
      apiKey,
      'GET',
      `/sessions/${sessionId}/contacts/profile-pictures?ids=${encodeURIComponent(ids)}`,
    );
  }

  async listChats(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    limit = 1000,
    offset = 0,
  ): Promise<OpenWaChatSummary[]> {
    return this.request<OpenWaChatSummary[]>(
      baseUrl,
      apiKey,
      'GET',
      `/sessions/${sessionId}/chats?limit=${limit}&offset=${offset}`,
    );
  }

  async getChatHistory(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    chatId: string,
    options:
      | {
          limit?: number;
          deep?: boolean;
          includeMedia?: boolean;
        }
      | number = {},
  ): Promise<OpenWaHistoryMessage[]> {
    const normalized =
      typeof options === 'number' ? { limit: options, deep: true } : options;
    const limit = normalized.limit ?? 50;
    const deep = normalized.deep ?? false;
    const includeMedia = normalized.includeMedia ?? false;
    const encodedChatId = encodeURIComponent(chatId);
    const params = new URLSearchParams({
      limit: String(limit),
      deep: deep ? 'true' : 'false',
      includeMedia: includeMedia ? 'true' : 'false',
    });
    return this.request<OpenWaHistoryMessage[]>(
      baseUrl,
      apiKey,
      'GET',
      `/sessions/${sessionId}/messages/${encodedChatId}/history?${params.toString()}`,
    );
  }

  async sendText(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    chatId: string,
    text: string,
  ): Promise<OpenWaSendTextResponse> {
    return this.request<OpenWaSendTextResponse>(
      baseUrl,
      apiKey,
      'POST',
      `/sessions/${sessionId}/messages/send-text`,
      { chatId, text },
    );
  }

  async sendMedia(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    sendPath: string,
    payload: OpenWaSendMediaRequest,
  ): Promise<OpenWaSendTextResponse> {
    return this.request<OpenWaSendTextResponse>(
      baseUrl,
      apiKey,
      'POST',
      `/sessions/${sessionId}/messages/${sendPath}`,
      payload,
    );
  }

  async getMessageMedia(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    chatId: string,
    messageId: string,
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const encodedChatId = encodeURIComponent(chatId);
    const encodedMessageId = encodeURIComponent(messageId);
    const url = `${this.normalizeBaseUrl(baseUrl)}/sessions/${sessionId}/messages/${encodedChatId}/${encodedMessageId}/media`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
        signal: AbortSignal.timeout(180_000),
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'network request failed';
      throw new ServiceUnavailableException(
        `OpenWA is unreachable at ${url}: ${detail}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(
        `OpenWA request failed (${response.status}): ${text.slice(0, 500)}`,
      );
    }

    const contentType =
      response.headers.get('content-type')?.split(';')[0]?.trim() ||
      'application/octet-stream';
    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  async createWebhook(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    input: { url: string; secret: string; events: string[] },
  ): Promise<OpenWaWebhookResponse> {
    return this.request<OpenWaWebhookResponse>(
      baseUrl,
      apiKey,
      'POST',
      `/sessions/${sessionId}/webhooks`,
      input,
    );
  }

  async updateWebhook(
    baseUrl: string,
    apiKey: string,
    sessionId: string,
    webhookId: string,
    input: { url: string; secret: string; events: string[] },
  ): Promise<OpenWaWebhookResponse> {
    return this.request<OpenWaWebhookResponse>(
      baseUrl,
      apiKey,
      'PUT',
      `/sessions/${sessionId}/webhooks/${webhookId}`,
      input,
    );
  }

  private normalizeBaseUrl(baseUrl: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    if (!trimmed) {
      throw new ServiceUnavailableException(
        'OpenWA base URL is not configured',
      );
    }
    const withApi = trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
    try {
      const parsed = new URL(withApi);
      if (parsed.hostname === 'localhost') {
        parsed.hostname = '127.0.0.1';
        return parsed.toString().replace(/\/+$/, '');
      }
    } catch {
      // keep withApi as-is when URL parsing fails
    }
    return withApi;
  }

  private async request<T>(
    baseUrl: string,
    apiKey: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.normalizeBaseUrl(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'network request failed';
      throw new ServiceUnavailableException(
        `OpenWA is unreachable at ${url}: ${detail}`,
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new BadGatewayException(
        `OpenWA request failed (${response.status}): ${text.slice(0, 500)}`,
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text.trim()) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadGatewayException(
        `OpenWA returned invalid JSON (${response.status})`,
      );
    }
  }
}
