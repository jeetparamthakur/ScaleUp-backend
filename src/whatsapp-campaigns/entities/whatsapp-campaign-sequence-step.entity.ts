import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { EmailTemplateDelayMode } from '../../email-templates/types/email-template.types';
import { WhatsappCampaignEntity } from './whatsapp-campaign.entity';

@Entity('whatsapp_campaign_sequence_steps')
@Index(['campaignId'])
@Unique(['campaignId', 'stepOrder'])
export class WhatsappCampaignSequenceStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id' })
  campaignId!: string;

  @Column({ name: 'step_order', type: 'int' })
  stepOrder!: number;

  @Column({ type: 'text' })
  body!: string;

  @Column({
    name: 'delay_mode',
    type: 'varchar',
    length: 16,
    default: 'relative',
  })
  delayMode!: EmailTemplateDelayMode;

  @Column({ name: 'delay_days', type: 'int', default: 0 })
  delayDays!: number;

  @Column({ name: 'scheduled_date', type: 'date', nullable: true })
  scheduledDate!: string | null;

  @ManyToOne(() => WhatsappCampaignEntity, (campaign) => campaign.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: WhatsappCampaignEntity;
}
