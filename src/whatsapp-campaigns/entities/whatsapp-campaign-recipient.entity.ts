import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { WhatsappSenderConnectionEntity } from '../../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';
import { WhatsappCampaignEntity } from './whatsapp-campaign.entity';

export type WhatsappCampaignRecipientStatus =
  'pending' | 'sent' | 'failed' | 'skipped' | 'replied';

@Entity('whatsapp_campaign_recipients')
@Index(['campaignId', 'status'])
@Index(['phoneE164', 'status'])
@Unique(['campaignId', 'phoneE164'])
export class WhatsappCampaignRecipientEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id' })
  campaignId!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'list_member_id', type: 'uuid', nullable: true })
  listMemberId!: string | null;

  @Column({ name: 'phone_e164', length: 32 })
  phoneE164!: string;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: WhatsappCampaignRecipientStatus;

  @Column({ name: 'sender_connection_id', type: 'uuid', nullable: true })
  senderConnectionId!: string | null;

  @Column({ name: 'replied_at', type: 'timestamptz', nullable: true })
  repliedAt!: Date | null;

  @Column({ name: 'reply_body', type: 'text', nullable: true })
  replyBody!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'current_step_order', type: 'int', default: 1 })
  currentStepOrder!: number;

  @Column({ name: 'next_send_at', type: 'timestamptz', nullable: true })
  nextSendAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => WhatsappCampaignEntity, (campaign) => campaign.recipients, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: WhatsappCampaignEntity;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => WhatsappSenderConnectionEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'sender_connection_id' })
  senderConnection!: WhatsappSenderConnectionEntity | null;
}
