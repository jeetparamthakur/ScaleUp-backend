import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbacModule } from '../abac/abac.module';
import { CryptoModule } from '../common/crypto/crypto.module';
import { OrgEntitlementsModule } from '../org-entitlements/org-entitlements.module';
import { WhatsappModule } from '../inbox/whatsapp/whatsapp.module';
import { WhatsappSenderConnectionEntity } from './entities/whatsapp-sender-connection.entity';
import { WhatsappSenderConnectionRepository } from './whatsapp-sender-connection.repository';
import { WhatsappSenderConnectionService } from './whatsapp-sender-connection.service';
import { WhatsappSenderConnectionsController } from './whatsapp-sender-connections.controller';
import { WhatsappSenderWebhookController } from './whatsapp-sender-webhook.controller';
import { WhatsappSenderWebhookService } from './whatsapp-sender-webhook.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WhatsappSenderConnectionEntity]),
    forwardRef(() => WhatsappModule),
    CryptoModule,
    OrgEntitlementsModule,
    forwardRef(() => AbacModule),
  ],
  controllers: [
    WhatsappSenderConnectionsController,
    WhatsappSenderWebhookController,
  ],
  providers: [
    WhatsappSenderConnectionRepository,
    WhatsappSenderConnectionService,
    WhatsappSenderWebhookService,
  ],
  exports: [
    WhatsappSenderConnectionRepository,
    WhatsappSenderWebhookService,
    WhatsappSenderConnectionService,
  ],
})
export class WhatsappSenderConnectionsModule {}
