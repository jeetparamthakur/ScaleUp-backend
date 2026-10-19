import { Injectable, OnModuleInit } from '@nestjs/common';
import { WhatsappSenderWebhookService } from '../whatsapp-sender-connections/whatsapp-sender-webhook.service';
import { WhatsappCampaignReplyService } from './whatsapp-campaign-reply.service';

@Injectable()
export class WhatsappCampaignWebhookBootstrapService implements OnModuleInit {
  constructor(
    private readonly senderWebhookService: WhatsappSenderWebhookService,
    private readonly replyService: WhatsappCampaignReplyService,
  ) {}

  onModuleInit(): void {
    this.senderWebhookService.registerCampaignReplyHandler(
      (senderConnectionId, payload) =>
        this.replyService.handleInbound(senderConnectionId, payload),
    );
  }
}
