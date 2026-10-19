export interface WhatsappWebhookMessageUpsert {
  conversationId: string;
  messageId: string;
  fromMe: boolean;
  needsMediaPrefetch: boolean;
}
