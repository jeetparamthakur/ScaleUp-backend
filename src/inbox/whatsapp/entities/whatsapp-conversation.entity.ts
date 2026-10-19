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
import { WhatsappSenderConnectionEntity } from '../../../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';
import { UserWhatsappConnectionEntity } from './user-whatsapp-connection.entity';
import { WhatsappMessageEntity } from './whatsapp-message.entity';

@Entity('whatsapp_conversations')
@Index(['senderConnectionId', 'lastMessageAt'])
@Index(['connectionId', 'lastMessageAt'])
export class WhatsappConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'connection_id', type: 'uuid', nullable: true })
  connectionId!: string | null;

  @Column({ name: 'sender_connection_id', type: 'uuid', nullable: true })
  senderConnectionId!: string | null;

  @Column({ name: 'chat_id', length: 128 })
  chatId!: string;

  @Column({ length: 255, default: '' })
  title!: string;

  @Column({ name: 'is_group', default: false })
  isGroup!: boolean;

  @Column({ name: 'last_message_preview', type: 'text', nullable: true })
  lastMessagePreview!: string | null;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @Column({ name: 'unread_count', type: 'int', default: 0 })
  unreadCount!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => UserWhatsappConnectionEntity, (row) => row.conversations, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'connection_id' })
  connection!: UserWhatsappConnectionEntity | null;

  @ManyToOne(() => WhatsappSenderConnectionEntity, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'sender_connection_id' })
  senderConnection!: WhatsappSenderConnectionEntity | null;

  @OneToMany(() => WhatsappMessageEntity, (row) => row.conversation)
  messages!: WhatsappMessageEntity[];
}
