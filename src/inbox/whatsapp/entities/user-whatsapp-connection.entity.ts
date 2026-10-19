import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../../organizations/entities/organization.entity';
import { User } from '../../../users/entities/user.entity';
import { WhatsappConversationEntity } from './whatsapp-conversation.entity';

export type WhatsappConnectionStatus =
  | 'created'
  | 'initializing'
  | 'qr_ready'
  | 'authenticating'
  | 'ready'
  | 'disconnected'
  | 'action_required'
  | 'failed';

@Entity('user_whatsapp_connections')
@Unique(['organizationId', 'userId'])
@Index(['organizationId'])
export class UserWhatsappConnectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

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

  @Column({ name: 'openwa_webhook_id', type: 'uuid', nullable: true })
  openwaWebhookId!: string | null;

  @Column({ name: 'webhook_secret_encrypted', type: 'text', nullable: true })
  webhookSecretEncrypted!: string | null;

  @Column({ name: 'last_backfill_at', type: 'timestamptz', nullable: true })
  lastBackfillAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

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

  @OneToMany(() => WhatsappConversationEntity, (row) => row.connection)
  conversations!: WhatsappConversationEntity[];
}
