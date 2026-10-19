import { Injectable, NotImplementedException } from '@nestjs/common';
import type {
  WhatsappSendTextInput,
  WhatsappSendTextResult,
  WhatsappTransportPort,
} from './whatsapp-transport.port';

/** Phase 2 placeholder — Meta WhatsApp Cloud API integration. */
@Injectable()
export class MetaCloudWhatsappTransport implements WhatsappTransportPort {
  readonly kind = 'meta' as const;

  sendText(input: WhatsappSendTextInput): Promise<WhatsappSendTextResult> {
    void input;
    throw new NotImplementedException(
      'Meta WhatsApp Cloud API transport is not implemented yet',
    );
  }
}
