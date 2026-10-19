import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { WhatsappConnectionStatus } from '../../inbox/whatsapp/entities/user-whatsapp-connection.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

@Entity('whatsapp_sender_connections')
@Index(['organizationId', 'userId'])
export class WhatsappSenderConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  displayName!: string | null;

  @Column({ name: 'openwa_session_id', type: 'uuid', nullable: true })
  openwaSessionId!: string | null;

  @Column({ name: 'openwa_session_name', length: 50 })
  openwaSessionName!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @Column({ name: 'push_name', type: 'varchar', length: 100, nullable: true })
  pushName!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'created' })
  status!: WhatsappConnectionStatus;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'daily_send_limit', type: 'int', nullable: true })
  dailySendLimit!: number | null;

  @Column({ name: 'sends_today_count', type: 'int', default: 0 })
  sendsTodayCount!: number;

  @Column({ name: 'sends_today_date', type: 'date', nullable: true })
  sendsTodayDate!: string | null;

  @Column({ name: 'openwa_webhook_id', type: 'uuid', nullable: true })
  openwaWebhookId!: string | null;

  @Column({ name: 'webhook_secret_encrypted', type: 'text', nullable: true })
  webhookSecretEncrypted!: string | null;

  @Column({ name: 'last_backfill_at', type: 'timestamptz', nullable: true })
  lastBackfillAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
