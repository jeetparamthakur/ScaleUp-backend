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
import { WhatsappConversationEntity } from './whatsapp-conversation.entity';

@Entity('whatsapp_messages')
@Unique(['conversationId', 'externalId'])
@Index(['conversationId', 'sentAt'])
export class WhatsappMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id' })
  conversationId!: string;

  @Column({ name: 'external_id', length: 255 })
  externalId!: string;

  @Column({ name: 'from_me', default: false })
  fromMe!: boolean;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'message_type', length: 32, default: 'text' })
  messageType!: string;

  @Column({ name: 'media_metadata', type: 'jsonb', nullable: true })
  mediaMetadata!: Record<string, unknown> | null;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => WhatsappConversationEntity, (row) => row.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation!: WhatsappConversationEntity;
}
