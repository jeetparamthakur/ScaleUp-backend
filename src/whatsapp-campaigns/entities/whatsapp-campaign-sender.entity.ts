import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { WhatsappSenderConnectionEntity } from '../../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';
import { WhatsappCampaignEntity } from './whatsapp-campaign.entity';

@Entity('whatsapp_campaign_senders')
@Index(['campaignId'])
@Unique(['campaignId', 'senderConnectionId'])
export class WhatsappCampaignSenderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'campaign_id' })
  campaignId!: string;

  @Column({ name: 'sender_connection_id' })
  senderConnectionId!: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @ManyToOne(() => WhatsappCampaignEntity, (campaign) => campaign.senders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: WhatsappCampaignEntity;

  @ManyToOne(() => WhatsappSenderConnectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_connection_id' })
  senderConnection!: WhatsappSenderConnectionEntity;
}
