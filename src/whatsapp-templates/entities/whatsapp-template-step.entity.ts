import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { WhatsappTemplateDelayMode } from '../types/whatsapp-template.types';
import { WhatsappTemplateEntity } from './whatsapp-template.entity';

@Entity('whatsapp_template_steps')
@Index(['templateId'])
@Unique(['templateId', 'stepOrder'])
export class WhatsappTemplateStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_id' })
  templateId!: string;

  @Column({ name: 'step_order', type: 'int' })
  stepOrder!: number;

  @Column({ type: 'text' })
  body!: string;

  @Column({
    name: 'delay_mode',
    type: 'varchar',
    length: 16,
    default: 'relative',
  })
  delayMode!: WhatsappTemplateDelayMode;

  @Column({ name: 'delay_days', type: 'int', default: 0 })
  delayDays!: number;

  @Column({ name: 'scheduled_date', type: 'date', nullable: true })
  scheduledDate!: string | null;

  @ManyToOne(() => WhatsappTemplateEntity, (template) => template.steps, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'template_id' })
  template!: WhatsappTemplateEntity;
}
