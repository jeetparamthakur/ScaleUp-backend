/**
 * Phase 2 (Meta Cloud API): implement MetaCloudWhatsappTransport alongside OpenWA.
 * Campaign send service will delegate to the transport matching campaign.transport.
 */
export interface WhatsappSendTextInput {
  organizationId: string;
  senderRefId: string;
  chatIdOrPhone: string;
  text: string;
}

export interface WhatsappSendTextResult {
  externalMessageId: string;
  timestamp: number;
}

export interface WhatsappTransportPort {
  readonly kind: 'openwa' | 'meta';

  sendText(input: WhatsappSendTextInput): Promise<WhatsappSendTextResult>;
}
