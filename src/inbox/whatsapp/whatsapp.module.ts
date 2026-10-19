import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbacModule } from '../../abac/abac.module';
import { CryptoModule } from '../../common/crypto/crypto.module';
import { OrgEntitlementsModule } from '../../org-entitlements/org-entitlements.module';
import { PlatformOpenWaSettingsEntity } from './entities/platform-openwa-settings.entity';
import { UserWhatsappConnectionEntity } from './entities/user-whatsapp-connection.entity';
import { WhatsappConversationEntity } from './entities/whatsapp-conversation.entity';
import { WhatsappMessageEntity } from './entities/whatsapp-message.entity';
import { OpenWaHttpClient } from './openwa-http.client';
import { PlatformOpenWaController } from './platform-openwa.controller';
import { PlatformOpenWaRepository } from './platform-openwa.repository';
import { PlatformOpenWaService } from './platform-openwa.service';
import { WhatsappBackfillService } from './whatsapp-backfill.service';
import { WhatsappConnectionRepository } from './whatsapp-connection.repository';
import { WhatsappConnectionService } from './whatsapp-connection.service';
import { WhatsappConversationRepository } from './whatsapp-conversation.repository';
import { WhatsappInboxController } from './whatsapp-inbox.controller';
import { WhatsappModuleInboxController } from './whatsapp-module-inbox.controller';
import { WhatsappInboxPersistenceService } from './whatsapp-inbox-persistence.service';
import { WhatsappInboxService } from './whatsapp-inbox.service';
import { WhatsappConversationContactResolverService } from './whatsapp-conversation-contact-resolver.service';
import { WhatsappMessageRepository } from './whatsapp-message.repository';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WhatsappCampaignsModule } from '../../whatsapp-campaigns/whatsapp-campaigns.module';
import { WhatsappSenderConnectionsModule } from '../../whatsapp-sender-connections/whatsapp-sender-connections.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlatformOpenWaSettingsEntity,
      UserWhatsappConnectionEntity,
      WhatsappConversationEntity,
      WhatsappMessageEntity,
    ]),
    CryptoModule,
    OrgEntitlementsModule,
    forwardRef(() => AbacModule),
    forwardRef(() => WhatsappCampaignsModule),
    forwardRef(() => WhatsappSenderConnectionsModule),
  ],
  controllers: [
    PlatformOpenWaController,
    WhatsappInboxController,
    WhatsappModuleInboxController,
    WhatsappWebhookController,
  ],
  providers: [
    PlatformOpenWaRepository,
    PlatformOpenWaService,
    OpenWaHttpClient,
    WhatsappConnectionRepository,
    WhatsappConversationRepository,
    WhatsappMessageRepository,
    WhatsappInboxPersistenceService,
    WhatsappBackfillService,
    WhatsappWebhookService,
    WhatsappConnectionService,
    WhatsappInboxService,
    WhatsappConversationContactResolverService,
  ],
  exports: [
    PlatformOpenWaService,
    OpenWaHttpClient,
    WhatsappInboxPersistenceService,
    WhatsappBackfillService,
    WhatsappInboxService,
  ],
})
export class WhatsappModule {}
