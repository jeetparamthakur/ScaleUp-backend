import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AbacModule } from '../abac/abac.module';
import { AuthModule } from '../auth/auth.module';
import { FileParserModule } from '../common/file-parser/file-parser.module';
import { FormsModule } from '../forms/forms.module';
import { OrgEntitlementsModule } from '../org-entitlements/org-entitlements.module';
import { ProspectsModule } from '../prospects/prospects.module';
import { RbacModule } from '../rbac/rbac.module';
import { WhatsappContactListMemberEntity } from './entities/whatsapp-contact-list-member.entity';
import { WhatsappContactListEntity } from './entities/whatsapp-contact-list.entity';
import { WhatsappContactListMapper } from './mappers/whatsapp-contact-list.mapper';
import { WhatsappContactListMembersRepository } from './whatsapp-contact-list-members.repository';
import { WhatsappContactListsController } from './whatsapp-contact-lists.controller';
import { WhatsappContactListsRepository } from './whatsapp-contact-lists.repository';
import { WhatsappContactListsService } from './whatsapp-contact-lists.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      WhatsappContactListEntity,
      WhatsappContactListMemberEntity,
    ]),
    FileParserModule,
    FormsModule,
    ProspectsModule,
    RbacModule,
    OrgEntitlementsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => AbacModule),
  ],
  controllers: [WhatsappContactListsController],
  providers: [
    WhatsappContactListsRepository,
    WhatsappContactListMembersRepository,
    WhatsappContactListsService,
    WhatsappContactListMapper,
  ],
  exports: [
    WhatsappContactListsService,
    WhatsappContactListsRepository,
    WhatsappContactListMembersRepository,
  ],
})
export class WhatsappContactListsModule {}
