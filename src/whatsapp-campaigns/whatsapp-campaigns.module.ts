import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbacModule } from '../abac/abac.module';
import { OrgEntitlementsModule } from '../org-entitlements/org-entitlements.module';
import { WhatsappModule } from '../inbox/whatsapp/whatsapp.module';
import { WhatsappContactListsModule } from '../whatsapp-contact-lists/whatsapp-contact-lists.module';
import { WhatsappSenderConnectionsModule } from '../whatsapp-sender-connections/whatsapp-sender-connections.module';
import { WhatsappCampaignEntity } from './entities/whatsapp-campaign.entity';
import { WhatsappCampaignEventEntity } from './entities/whatsapp-campaign-event.entity';
import { WhatsappCampaignMessageEntity } from './entities/whatsapp-campaign-message.entity';
import { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import { WhatsappCampaignSenderEntity } from './entities/whatsapp-campaign-sender.entity';
import { WhatsappCampaignSequenceStepEntity } from './entities/whatsapp-campaign-sequence-step.entity';
import { MetaCloudWhatsappTransport } from './transport/meta-cloud-whatsapp-transport';
import { OpenWaWhatsappTransport } from './transport/openwa-whatsapp-transport';
import { WhatsappCampaignEventsRepository } from './whatsapp-campaign-events.repository';
import { WhatsappCampaignMessagesRepository } from './whatsapp-campaign-messages.repository';
import { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';
import { WhatsappCampaignInboundDispatchService } from './whatsapp-campaign-inbound-dispatch.service';
import { WhatsappCampaignReplyService } from './whatsapp-campaign-reply.service';
import { WhatsappCampaignReplySyncService } from './whatsapp-campaign-reply-sync.service';
import { WhatsappCampaignSchedulerService } from './whatsapp-campaign-scheduler.service';
import { WhatsappCampaignSendService } from './whatsapp-campaign-send.service';
import { WhatsappCampaignSendersRepository } from './whatsapp-campaign-senders.repository';
import { WhatsappCampaignSequenceStepsRepository } from './whatsapp-campaign-sequence-steps.repository';
import { WhatsappCampaignWebhookBootstrapService } from './whatsapp-campaign-webhook-bootstrap.service';
import { WhatsappCampaignRecipientMapper } from './mappers/whatsapp-campaign-recipient.mapper';
import { WhatsappCampaignsController } from './whatsapp-campaigns.controller';
import { WhatsappCampaignsRepository } from './whatsapp-campaigns.repository';
import { WhatsappCampaignsService } from './whatsapp-campaigns.service';
import { WhatsappDashboardRepository } from './whatsapp-dashboard.repository';
import { WhatsappDashboardService } from './whatsapp-dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappCampaignEntity,
      WhatsappCampaignSenderEntity,
      WhatsappCampaignRecipientEntity,
      WhatsappCampaignMessageEntity,
      WhatsappCampaignEventEntity,
      WhatsappCampaignSequenceStepEntity,
    ]),
    forwardRef(() => WhatsappModule),
    WhatsappContactListsModule,
    WhatsappSenderConnectionsModule,
    OrgEntitlementsModule,
    forwardRef(() => AbacModule),
  ],
  controllers: [WhatsappCampaignsController],
  providers: [
    WhatsappCampaignsRepository,
    WhatsappCampaignSendersRepository,
    WhatsappCampaignRecipientsRepository,
    WhatsappCampaignMessagesRepository,
    WhatsappCampaignEventsRepository,
    WhatsappCampaignSequenceStepsRepository,
    WhatsappCampaignRecipientMapper,
    WhatsappCampaignsService,
    WhatsappDashboardRepository,
    WhatsappDashboardService,
    WhatsappCampaignSendService,
    WhatsappCampaignSchedulerService,
    WhatsappCampaignReplyService,
    WhatsappCampaignInboundDispatchService,
    WhatsappCampaignReplySyncService,
    WhatsappCampaignWebhookBootstrapService,
    OpenWaWhatsappTransport,
    MetaCloudWhatsappTransport,
  ],
  exports: [
    WhatsappCampaignReplyService,
    WhatsappCampaignInboundDispatchService,
  ],
})
export class WhatsappCampaignsModule {}
