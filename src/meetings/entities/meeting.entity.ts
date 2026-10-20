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
import { Organization } from '../../organizations/entities/organization.entity';
import { ProspectEntity } from '../../prospects/entities/prospect.entity';
import { User } from '../../users/entities/user.entity';
import type { MeetingPlatform, MeetingStatus } from '../types/meeting.types';

@Entity('meetings')
@Index(['organizationId'])
@Index(['organizationId', 'status'])
@Index(['organizationId', 'startAt'])
export class MeetingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'organization_id' })
  organizationId!: string;

  @Column({ name: 'prospect_id' })
  prospectId!: string;

  @Column({ type: 'varchar', length: 16 })
  platform!: MeetingPlatform;

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  status!: MeetingStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  title!: string | null;

  @Column({ name: 'start_at', type: 'timestamptz', nullable: true })
  startAt!: Date | null;

  @Column({ name: 'end_at', type: 'timestamptz', nullable: true })
  endAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'text', nullable: true })
  agenda!: string | null;

  @Column({ name: 'meeting_url', type: 'varchar', length: 512, nullable: true })
  meetingUrl!: string | null;

  @Column({
    name: 'external_event_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  externalEventId!: string | null;

  @Column({ name: 'created_by_id', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => ProspectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'prospect_id' })
  prospect!: ProspectEntity;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy!: User | null;
}
