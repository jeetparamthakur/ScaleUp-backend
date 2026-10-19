import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { WhatsappContactListEntity } from '../../whatsapp-contact-lists/entities/whatsapp-contact-list.entity';
import { WhatsappCampaignSenderEntity } from './whatsapp-campaign-sender.entity';
import { WhatsappCampaignRecipientEntity } from './whatsapp-campaign-recipient.entity';
import { WhatsappCampaignSequenceStepEntity } from './whatsapp-campaign-sequence-step.entity';

export type WhatsappCampaignStatus =
  'draft' | 'scheduled' | 'sending' | 'completed' | 'stopped';

export type WhatsappCampaignTransport = 'openwa' | 'meta';

@Entity('whatsapp_campaigns')
@Index(['organizationId', 'status'])
export class WhatsappCampaignEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'created_by_user_id' })
  createdByUserId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: 'message_body', type: 'text' })
  messageBody!: string;

  @Column({ name: 'contact_list_id' })
  contactListId!: string;

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status!: WhatsappCampaignStatus;

  @Column({ name: 'launch_at', type: 'timestamptz', nullable: true })
  launchAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'openwa' })
  transport!: WhatsappCampaignTransport;

  @Column({ name: 'daily_batch_size', type: 'int', default: 50 })
  dailyBatchSize!: number;

  @Column({ name: 'send_interval_seconds', type: 'int', nullable: true })
  sendIntervalSeconds!: number | null;

  @Column({ name: 'sending_window_start_minutes', type: 'int', nullable: true })
  sendingWindowStartMinutes!: number | null;

  @Column({ name: 'sending_window_end_minutes', type: 'int', nullable: true })
  sendingWindowEndMinutes!: number | null;

  @Column({
    name: 'distribute_recipients_equally',
    type: 'boolean',
    default: false,
  })
  distributeRecipientsEqually!: boolean;

  @Column({ name: 'sends_today_count', type: 'int', default: 0 })
  sendsTodayCount!: number;

  @Column({ name: 'sends_today_date', type: 'date', nullable: true })
  sendsTodayDate!: string | null;

  @Column({
    name: 'next_send_eligible_at',
    type: 'timestamptz',
    nullable: true,
  })
  nextSendEligibleAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdByUser!: User;

  @ManyToOne(() => WhatsappContactListEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'contact_list_id' })
  contactList!: WhatsappContactListEntity;

  @OneToMany(() => WhatsappCampaignSenderEntity, (row) => row.campaign)
  senders!: WhatsappCampaignSenderEntity[];

  @OneToMany(() => WhatsappCampaignRecipientEntity, (row) => row.campaign)
  recipients!: WhatsappCampaignRecipientEntity[];

  @OneToMany(() => WhatsappCampaignSequenceStepEntity, (row) => row.campaign)
  steps!: WhatsappCampaignSequenceStepEntity[];
}
