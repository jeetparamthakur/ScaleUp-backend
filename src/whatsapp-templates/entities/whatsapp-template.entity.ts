import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  WhatsappTemplateType,
  WhatsappTemplateVisibility,
} from '../types/whatsapp-template.types';
import { WhatsappTemplateStepEntity } from './whatsapp-template-step.entity';

@Entity('whatsapp_templates')
@Index(['organizationId'])
@Index(['createdByUserId'])
export class WhatsappTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'created_by_user_id' })
  createdByUserId!: string;

  @Column({ length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 16 })
  type!: WhatsappTemplateType;

  @Column({ type: 'varchar', length: 16, default: 'private' })
  visibility!: WhatsappTemplateVisibility;

  @Column({ name: 'is_active', default: true })
  isActive!: boolean;

  @OneToMany(() => WhatsappTemplateStepEntity, (step) => step.template, {
    cascade: true,
  })
  steps!: WhatsappTemplateStepEntity[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
