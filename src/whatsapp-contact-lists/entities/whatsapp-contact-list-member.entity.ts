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
import { WhatsappContactListEntity } from './whatsapp-contact-list.entity';

@Entity('whatsapp_contact_list_members')
@Index(['organizationId'])
@Index(['listId'])
@Unique(['listId', 'phone'])
export class WhatsappContactListMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'list_id' })
  listId!: string;

  @Column({ length: 32 })
  phone!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 255, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 255, nullable: true })
  lastName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company!: string | null;

  @Column({ name: 'custom_fields', type: 'jsonb', default: {} })
  customFields!: Record<string, string>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => WhatsappContactListEntity, (list) => list.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'list_id' })
  list!: WhatsappContactListEntity;
}
