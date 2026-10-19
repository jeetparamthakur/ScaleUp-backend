import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WhatsappCampaignRecipientEntity } from './whatsapp-campaign-recipient.entity';

@Entity('whatsapp_campaign_messages')
export class WhatsappCampaignMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_id' })
  recipientId!: string;

  @Column({ name: 'external_message_id', length: 255 })
  externalMessageId!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'step_order', type: 'int', default: 1 })
  stepOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => WhatsappCampaignRecipientEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipient_id' })
  recipient!: WhatsappCampaignRecipientEntity;
}
