import { Injectable } from '@nestjs/common';
import { WhatsappSenderConnectionRepository } from '../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import { WhatsappCampaignReplyService } from './whatsapp-campaign-reply.service';

/**
 * Routes inbound OpenWA messages to campaign reply attribution by session id.
 * Used when webhooks hit the inbox URL but the session is also a campaign sender.
 */
@Injectable()
export class WhatsappCampaignInboundDispatchService {
  constructor(
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
    private readonly replyService: WhatsappCampaignReplyService,
  ) {}

  async dispatchByOpenWaSessionId(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (payload.fromMe) {
      return;
    }

    const senders =
      await this.senderConnectionRepository.findByOpenwaSessionId(sessionId);

    for (const sender of senders) {
      await this.replyService.handleInbound(sender.id, payload);
    }
  }
}
