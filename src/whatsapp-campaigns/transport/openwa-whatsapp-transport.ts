import { Injectable } from '@nestjs/common';
import { OpenWaHttpClient } from '../../inbox/whatsapp/openwa-http.client';
import { PlatformOpenWaService } from '../../inbox/whatsapp/platform-openwa.service';
import { WhatsappSenderConnectionRepository } from '../../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import { phoneToOpenWaChatId } from '../utils/phone-to-openwa-chat-id.util';
import type {
  WhatsappSendTextInput,
  WhatsappSendTextResult,
  WhatsappTransportPort,
} from './whatsapp-transport.port';

@Injectable()
export class OpenWaWhatsappTransport implements WhatsappTransportPort {
  readonly kind = 'openwa' as const;

  constructor(
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
    private readonly senderRepository: WhatsappSenderConnectionRepository,
  ) {}

  async sendText(
    input: WhatsappSendTextInput,
  ): Promise<WhatsappSendTextResult> {
    const sender = await this.senderRepository.findById(input.senderRefId);
    if (!sender || sender.organizationId !== input.organizationId) {
      throw new Error('Sender connection not found');
    }

    if (!sender.openwaSessionId) {
      throw new Error('Sender is not ready');
    }

    const { baseUrl, apiKey } =
      await this.platformOpenWaService.resolveCredentials();

    const chatId = input.chatIdOrPhone.includes('@')
      ? input.chatIdOrPhone
      : phoneToOpenWaChatId(input.chatIdOrPhone);

    const response = await this.openWaClient.sendText(
      baseUrl,
      apiKey,
      sender.openwaSessionId,
      chatId,
      input.text,
    );

    return {
      externalMessageId: response.messageId,
      timestamp: response.timestamp,
    };
  }
}
