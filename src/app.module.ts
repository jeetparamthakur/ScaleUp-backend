import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AbacModule } from './abac/abac.module';
import { AuthModule } from './auth/auth.module';
import { AuthOAuthModule } from './auth-oauth/auth-oauth.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ContactListsModule } from './contact-lists/contact-lists.module';
import { EmailCampaignsModule } from './email-campaigns/email-campaigns.module';
import { BantSettingsModule } from './bant-settings/bant-settings.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { CompaniesModule } from './companies/companies.module';
import { EmailConfigModule } from './email-config/email-config.module';
import { EmailTemplatesModule } from './email-templates/email-templates.module';
import { EmailAttachmentsModule } from './email-attachments/email-attachments.module';
import { ManualListsModule } from './manual-lists/manual-lists.module';
import { CalendarConnectionsModule } from './calendar-connections/calendar-connections.module';
import { MeetingsModule } from './meetings/meetings.module';
import { NotionIntegrationsModule } from './notion-integrations/notion-integrations.module';
import { ProspectsModule } from './prospects/prospects.module';
import { LocationModule } from './location/location.module';
import { MailboxesModule } from './mailboxes/mailboxes.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { FormsModule } from './forms/forms.module';
import { OrgEntitlementsModule } from './org-entitlements/org-entitlements.module';
import { PlatformModule } from './platform/platform.module';
import { RbacModule } from './rbac/rbac.module';
import { SignupModule } from './signup/signup.module';
import { TablePreferencesModule } from './table-preferences/table-preferences.module';
import { OnPageSeoModule } from './on-page-seo/on-page-seo.module';
import { WebsiteModule } from './website/website.module';
import { UsersModule } from './users/users.module';
import { WhatsappModule } from './inbox/whatsapp/whatsapp.module';
import { WhatsappContactListsModule } from './whatsapp-contact-lists/whatsapp-contact-lists.module';
import { WhatsappSenderConnectionsModule } from './whatsapp-sender-connections/whatsapp-sender-connections.module';
import { WhatsappCampaignsModule } from './whatsapp-campaigns/whatsapp-campaigns.module';
import { WhatsappTemplatesModule } from './whatsapp-templates/whatsapp-templates.module';

const skipDb = process.env.SKIP_DB === 'true';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    CryptoModule,
    ...(skipDb
      ? []
      : [
          DatabaseModule,
          UsersModule,
          RbacModule,
          AbacModule,
          AuthModule,
          AuthOAuthModule,
          SignupModule,
          InvitationsModule,
          MailboxesModule,
          EmailConfigModule,
          EmailTemplatesModule,
          EmailAttachmentsModule,
          CompanyConfigModule,
          BantSettingsModule,
          LocationModule,
          CompaniesModule,
          ContactListsModule,
          ManualListsModule,
          ProspectsModule,
          CalendarConnectionsModule,
          MeetingsModule,
          NotionIntegrationsModule,
          EmailCampaignsModule,
          AnalyticsModule,
          AuditLogsModule,
          OnPageSeoModule,
          WebsiteModule,
          OrgEntitlementsModule,
          PlatformModule,
          FormsModule,
          TablePreferencesModule,
          WhatsappModule,
          WhatsappContactListsModule,
          WhatsappSenderConnectionsModule,
          WhatsappCampaignsModule,
          WhatsappTemplatesModule,
        ]),
    HealthModule.register(!skipDb),
  ],
})
export class AppModule {}
