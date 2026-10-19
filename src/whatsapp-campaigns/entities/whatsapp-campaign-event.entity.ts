import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WhatsappCampaignRecipientEntity } from './whatsapp-campaign-recipient.entity';
import { WhatsappCampaignEntity } from './whatsapp-campaign.entity';

export type WhatsappCampaignEventType = 'sent' | 'failed' | 'reply';

@Entity('whatsapp_campaign_events')
@Index(['campaignId', 'createdAt'])
export class WhatsappCampaignEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id' })
  campaignId!: string;

  @Column({ name: 'recipient_id', type: 'uuid', nullable: true })
  recipientId!: string | null;

  @Column({ name: 'event_type', length: 32 })
  eventType!: WhatsappCampaignEventType;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => WhatsappCampaignEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: WhatsappCampaignEntity;

  @ManyToOne(() => WhatsappCampaignRecipientEntity, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: WhatsappCampaignRecipientEntity | null;
}
