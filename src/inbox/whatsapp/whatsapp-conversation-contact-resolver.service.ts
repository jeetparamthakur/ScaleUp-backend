import { Injectable, Logger } from '@nestjs/common';
import { OpenWaHttpClient, type OpenWaContact } from './openwa-http.client';
import { PlatformOpenWaService } from './platform-openwa.service';
import {
  needsWhatsappContactResolve,
  pickWhatsappConversationTitle,
} from './utils/whatsapp-conversation-title.util';

@Injectable()
export class WhatsappConversationContactResolverService {
  private readonly logger = new Logger(
    WhatsappConversationContactResolverService.name,
  );

  constructor(
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
  ) {}

  async resolveTitleForChat(
    openwaSessionId: string,
    chatId: string,
    title: string,
    isGroup: boolean,
  ): Promise<string> {
    const preliminary = pickWhatsappConversationTitle({
      title,
      chatId,
      isGroup,
    });

    if (!needsWhatsappContactResolve(title, chatId, isGroup)) {
      return preliminary;
    }

    try {
      const { baseUrl, apiKey } =
        await this.platformOpenWaService.resolveCredentials();

      const contact = await this.openWaClient.getContact(
        baseUrl,
        apiKey,
        openwaSessionId,
        chatId,
      );

      let phoneDigits = contact?.number?.replace(/\D/g, '') ?? '';
      if (phoneDigits.length < 8) {
        const resolved = await this.openWaClient.resolveContactPhone(
          baseUrl,
          apiKey,
          openwaSessionId,
          chatId,
        );
        phoneDigits = resolved?.replace(/\D/g, '') ?? '';
      }

      return pickWhatsappConversationTitle({
        title,
        chatId,
        isGroup,
        savedName: contact?.name ?? null,
        pushName: contact?.pushName ?? null,
        phoneDigits,
      });
    } catch (error) {
      this.logger.debug(
        `Contact resolve failed for ${chatId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return preliminary;
    }
  }

  readContactHintsFromPayload(
    payload: Record<string, unknown>,
  ): Pick<OpenWaContact, 'name' | 'pushName' | 'number'> | null {
    const contact = payload.contact;
    if (!contact || typeof contact !== 'object') {
      return null;
    }
    const record = contact as Record<string, unknown>;
    const number =
      typeof record.number === 'string' ? record.number : undefined;
    const name = typeof record.name === 'string' ? record.name : undefined;
    const pushName =
      typeof record.pushName === 'string' ? record.pushName : undefined;
    if (!number && !name && !pushName) {
      return null;
    }
    return {
      number: number ?? '',
      name,
      pushName,
    };
  }
}
