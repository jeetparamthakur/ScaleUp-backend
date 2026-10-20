import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  disableEnvSslVerification,
  HOSTED_PG_SSL,
  parsePostgresConnection,
} from './postgres-ssl.util';
import {
  AnalyticsDashboardEntity,
  AnalyticsWidgetEntity,
} from '../analytics/entities/analytics.entities';
import { AuditLogEntity } from '../audit-logs/entities/audit-log.entity';
import { AbacPolicyEntity } from '../abac/entities/abac-policy.entity';
import { UserAbacPolicyEntity } from '../abac/entities/user-abac-policy.entity';
import { ContactListMemberEntity } from '../contact-lists/entities/contact-list-member.entity';
import { ContactListEntity } from '../contact-lists/entities/contact-list.entity';
import { InvitationEntity } from '../invitations/entities/invitation.entity';
import { EmailCampaignEventEntity } from '../email-campaigns/entities/email-campaign-event.entity';
import { EmailCampaignMailboxSenderEntity } from '../email-campaigns/entities/email-campaign-mailbox-sender.entity';
import { EmailCampaignMessageEntity } from '../email-campaigns/entities/email-campaign-message.entity';
import { AudienceContactEntity } from '../email-campaigns/entities/audience-contact.entity';
import { EmailExcludedAddressEntity } from '../email-campaigns/entities/email-excluded-address.entity';
import { EmailCampaignRecipientEntity } from '../email-campaigns/entities/email-campaign-recipient.entity';
import { EmailCampaignSequenceStepEntity } from '../email-campaigns/entities/email-campaign-sequence-step.entity';
import { EmailCampaignEntity } from '../email-campaigns/entities/email-campaign.entity';
import { OrganizationCampaignIdSettingsEntity } from '../email-campaigns/campaign-id-format/entities/organization-campaign-id-settings.entity';
import { EmailCampaignDeleteRequestEntity } from '../email-campaigns/entities/email-campaign-delete-request.entity';
import { EmailCampaignCustomFieldDefinitionEntity } from '../email-campaigns/entities/email-campaign-custom-field-definition.entity';
import { EmailCampaignCustomFieldOptionEntity } from '../email-campaigns/entities/email-campaign-custom-field-option.entity';
import { CompanyConfigOptionEntity } from '../company-config/entities/company-config-option.entity';
import { OrganizationBantSettingsEntity } from '../bant-settings/entities/organization-bant-settings.entity';
import { CompanyFieldSchemaEntity } from '../companies/entities/company-field-schema.entity';
import { CompanyEntity } from '../companies/entities/company.entity';
import { EmailConfigOptionEntity } from '../email-config/entities/email-config-option.entity';
import { EmailTemplateStepEntity } from '../email-templates/entities/email-template-step.entity';
import { EmailStepAttachmentEntity } from '../email-attachments/entities/email-step-attachment.entity';
import { EmailTemplateEntity } from '../email-templates/entities/email-template.entity';
import { FormSchemaEntity } from '../forms/entities/form-schema.entity';
import { ManualListRowEntity } from '../manual-lists/entities/manual-list-row.entity';
import { ManualListEntity } from '../manual-lists/entities/manual-list.entity';
import { UserCalendarConnectionEntity } from '../calendar-connections/entities/user-calendar-connection.entity';
import { MeetingEntity } from '../meetings/entities/meeting.entity';
import { ProspectDeleteRequestEntity } from '../prospects/entities/prospect-delete-request.entity';
import { ProspectEngagementEntity } from '../prospects/entities/prospect-engagement.entity';
import { ProspectFieldSchemaEntity } from '../prospects/entities/prospect-field-schema.entity';
import { ProspectEntity } from '../prospects/entities/prospect.entity';
import { OrganizationLocationSettingsEntity } from '../location/entities/organization-location-settings.entity';
import { OrganizationNotionConnectionEntity } from '../notion-integrations/entities/organization-notion-connection.entity';
import { MailboxEntity } from '../mailboxes/entities/mailbox.entity';
import { OrganizationEntitlementsEntity } from '../org-entitlements/entities/organization-entitlements.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { PermissionEntity } from '../rbac/entities/permission.entity';
import { RolePermissionEntity } from '../rbac/entities/role-permission.entity';
import { RoleEntity } from '../rbac/entities/role.entity';
import { UserRoleEntity } from '../rbac/entities/user-role.entity';
import { SignupSession } from '../signup/entities/signup-session.entity';
import { PlatformAuthOAuthProviderEntity } from '../auth-oauth/entities/platform-auth-oauth-provider.entity';
import { TableColumnDefaultEntity } from '../table-preferences/entities/table-column-default.entity';
import { UserTableColumnPreferenceEntity } from '../table-preferences/entities/user-table-column-preference.entity';
import { OnPageAuditRunEntity } from '../on-page-seo/entities/on-page-audit-run.entity';
import { OnPagePageResultEntity } from '../on-page-seo/entities/on-page-page-result.entity';
import { WebsitePropertyEntity } from '../on-page-seo/entities/website-property.entity';
import { OrganizationGoogleConnectionEntity } from '../website/entities/organization-google-connection.entity';
import { OrganizationGoogleOAuthAppEntity } from '../website/entities/organization-google-oauth-app.entity';
import { OrganizationWebsiteSettingsEntity } from '../website/entities/organization-website-settings.entity';
import { User } from '../users/entities/user.entity';
import { PlatformOpenWaSettingsEntity } from '../inbox/whatsapp/entities/platform-openwa-settings.entity';
import { UserWhatsappConnectionEntity } from '../inbox/whatsapp/entities/user-whatsapp-connection.entity';
import { WhatsappConversationEntity } from '../inbox/whatsapp/entities/whatsapp-conversation.entity';
import { WhatsappMessageEntity } from '../inbox/whatsapp/entities/whatsapp-message.entity';
import { WhatsappContactListMemberEntity } from '../whatsapp-contact-lists/entities/whatsapp-contact-list-member.entity';
import { WhatsappContactListEntity } from '../whatsapp-contact-lists/entities/whatsapp-contact-list.entity';
import { WhatsappSenderConnectionEntity } from '../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';
import { WhatsappCampaignEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign.entity';
import { WhatsappCampaignEventEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign-event.entity';
import { WhatsappCampaignMessageEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign-message.entity';
import { WhatsappCampaignRecipientEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign-recipient.entity';
import { WhatsappCampaignSenderEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign-sender.entity';
import { WhatsappCampaignSequenceStepEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign-sequence-step.entity';
import { WhatsappTemplateEntity } from '../whatsapp-templates/entities/whatsapp-template.entity';
import { WhatsappTemplateStepEntity } from '../whatsapp-templates/entities/whatsapp-template-step.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('databaseUrl') ?? '';
        const hosted =
          process.env.NODE_ENV === 'production' ||
          process.env.RENDER === 'true';
        const usesLocalFallback =
          url.includes('localhost:5435') || url.includes('127.0.0.1:5435');

        if (!url.trim() || (hosted && usesLocalFallback)) {
          throw new Error(
            'DATABASE_URL is missing. On Render, set it to the Internal Database URL of your Postgres instance (not localhost:5435).',
          );
        }

        const useSsl =
          hosted || (!url.includes('localhost') && !url.includes('127.0.0.1'));
        const ssl = useSsl ? { ...HOSTED_PG_SSL } : false;
        const connection = parsePostgresConnection(url);

        if (useSsl) {
          disableEnvSslVerification();
        }

        return {
          type: 'postgres' as const,
          host: connection.host,
          port: connection.port,
          username: connection.username,
          password: connection.password,
          database: connection.database,
          ssl,
          entities: [
            User,
            Organization,
            SignupSession,
            PlatformAuthOAuthProviderEntity,
            PermissionEntity,
            RoleEntity,
            RolePermissionEntity,
            UserRoleEntity,
            AbacPolicyEntity,
            UserAbacPolicyEntity,
            InvitationEntity,
            MailboxEntity,
            EmailConfigOptionEntity,
            EmailTemplateEntity,
            EmailTemplateStepEntity,
            EmailStepAttachmentEntity,
            CompanyConfigOptionEntity,
            OrganizationBantSettingsEntity,
            OrganizationLocationSettingsEntity,
            OrganizationNotionConnectionEntity,
            CompanyFieldSchemaEntity,
            CompanyEntity,
            ContactListEntity,
            ContactListMemberEntity,
            ManualListEntity,
            ManualListRowEntity,
            ProspectFieldSchemaEntity,
            ProspectEntity,
            ProspectEngagementEntity,
            ProspectDeleteRequestEntity,
            MeetingEntity,
            UserCalendarConnectionEntity,
            EmailCampaignEntity,
            OrganizationCampaignIdSettingsEntity,
            EmailCampaignDeleteRequestEntity,
            EmailCampaignSequenceStepEntity,
            EmailCampaignMailboxSenderEntity,
            EmailCampaignRecipientEntity,
            EmailCampaignMessageEntity,
            EmailCampaignEventEntity,
            AudienceContactEntity,
            EmailExcludedAddressEntity,
            EmailCampaignCustomFieldDefinitionEntity,
            EmailCampaignCustomFieldOptionEntity,
            AnalyticsDashboardEntity,
            AnalyticsWidgetEntity,
            AuditLogEntity,
            WebsitePropertyEntity,
            OnPageAuditRunEntity,
            OnPagePageResultEntity,
            OrganizationGoogleConnectionEntity,
            OrganizationGoogleOAuthAppEntity,
            OrganizationWebsiteSettingsEntity,
            OrganizationEntitlementsEntity,
            FormSchemaEntity,
            UserTableColumnPreferenceEntity,
            TableColumnDefaultEntity,
            PlatformOpenWaSettingsEntity,
            UserWhatsappConnectionEntity,
            WhatsappConversationEntity,
            WhatsappMessageEntity,
            WhatsappContactListEntity,
            WhatsappContactListMemberEntity,
            WhatsappSenderConnectionEntity,
            WhatsappCampaignEntity,
            WhatsappCampaignSenderEntity,
            WhatsappCampaignRecipientEntity,
            WhatsappCampaignMessageEntity,
            WhatsappCampaignEventEntity,
            WhatsappCampaignSequenceStepEntity,
            WhatsappTemplateEntity,
            WhatsappTemplateStepEntity,
          ],
          synchronize:
            process.env.TYPEORM_SYNCHRONIZE === 'true' ||
            (process.env.NODE_ENV !== 'production' &&
              process.env.RENDER !== 'true' &&
              process.env.TYPEORM_SYNCHRONIZE !== 'false'),
          logging: false,
          extra: {
            max: 2,
            idleTimeoutMillis: 30_000,
            connectionTimeoutMillis: 10_000,
            ...(useSsl ? { ssl } : {}),
          },
          retryAttempts: hosted ? 5 : 10,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
