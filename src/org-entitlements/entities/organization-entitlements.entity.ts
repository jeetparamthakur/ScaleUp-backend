import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import type { OrgLimitsMap } from '../types/org-entitlements.types';
import type { OrgModule } from '../org-entitlements.registry';

@Entity('organization_entitlements')
export class OrganizationEntitlementsEntity {
  @PrimaryColumn({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({
    name: 'enabled_modules',
    type: 'text',
    array: true,
    default: () =>
      "ARRAY['dashboard','email','inbox','crm','website','settings']::text[]",
  })
  enabledModules!: OrgModule[];

  @Column({ name: 'platform_caps', type: 'jsonb', default: {} })
  platformCaps!: OrgLimitsMap;

  @Column({ name: 'org_limits', type: 'jsonb', default: {} })
  orgLimits!: OrgLimitsMap;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;
}
