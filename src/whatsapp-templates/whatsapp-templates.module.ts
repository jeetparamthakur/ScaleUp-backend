import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbacModule } from '../abac/abac.module';
import { AuthModule } from '../auth/auth.module';
import { OrgEntitlementsModule } from '../org-entitlements/org-entitlements.module';
import { RbacModule } from '../rbac/rbac.module';
import { WhatsappTemplateStepEntity } from './entities/whatsapp-template-step.entity';
import { WhatsappTemplateEntity } from './entities/whatsapp-template.entity';
import { WhatsappTemplateMapper } from './mappers/whatsapp-template.mapper';
import { WhatsappTemplatesController } from './whatsapp-templates.controller';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';
import { WhatsappTemplatesService } from './whatsapp-templates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappTemplateEntity,
      WhatsappTemplateStepEntity,
    ]),
    RbacModule,
    OrgEntitlementsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AbacModule),
  ],
  controllers: [WhatsappTemplatesController],
  providers: [
    WhatsappTemplatesRepository,
    WhatsappTemplatesService,
    WhatsappTemplateMapper,
  ],
  exports: [WhatsappTemplatesService, WhatsappTemplatesRepository],
})
export class WhatsappTemplatesModule {}
