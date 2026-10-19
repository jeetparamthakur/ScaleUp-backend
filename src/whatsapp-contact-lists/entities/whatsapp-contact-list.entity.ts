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
import type { WhatsappListFieldSchema } from '../types/whatsapp-list-field-schema';
import type { WhatsappListVisibility } from '../types/whatsapp-list-visibility';
import { WhatsappContactListMemberEntity } from './whatsapp-contact-list-member.entity';

@Entity('whatsapp_contact_lists')
@Index(['organizationId'])
@Index(['createdByUserId'])
export class WhatsappContactListEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ length: 255 })
  name!: string;

  @Column({ name: 'contact_count', type: 'int', default: 0 })
  contactCount!: number;

  @Column({ name: 'field_schema', type: 'jsonb', default: {} })
  fieldSchema!: WhatsappListFieldSchema;

  @Column({ type: 'varchar', length: 16, default: 'org' })
  visibility!: WhatsappListVisibility;

  @Column({ name: 'created_by_user_id' })
  createdByUserId!: string;

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

  @OneToMany(() => WhatsappContactListMemberEntity, (member) => member.list, {
    cascade: true,
  })
  members!: WhatsappContactListMemberEntity[];
}
