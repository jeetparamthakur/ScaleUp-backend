import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('platform_openwa_settings')
export class PlatformOpenWaSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 16, default: 'default' })
  id!: string;

  @Column({ name: 'base_url', type: 'varchar', length: 512, default: '' })
  baseUrl!: string;

  @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
  apiKeyEncrypted!: string | null;

  @Column({ default: false })
  enabled!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
