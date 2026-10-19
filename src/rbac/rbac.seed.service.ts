import { Injectable, OnModuleInit } from '@nestjs/common';
import { PermissionsRepository } from './permissions.repository';
import { RolesRepository } from './roles.repository';

interface PermissionSeed {
  key: string;
  resource: string;
  action: string;
  description: string;
}

interface RoleSeed {
  name: string;
  slug: string;
  description: string;
  permissionKeys: string[] | 'all';
}

const PERMISSIONS: PermissionSeed[] = [
  {
    key: 'campaigns:read',
    resource: 'campaigns',
    action: 'read',
    description: 'View campaigns',
  },
  {
    key: 'campaigns:create',
    resource: 'campaigns',
    action: 'create',
    description: 'Create new campaigns',
  },
  {
    key: 'campaigns:update',
    resource: 'campaigns',
    action: 'update',
    description: 'Edit existing campaigns',
  },
  {
    key: 'campaigns:delete',
    resource: 'campaigns',
    action: 'delete',
    description: 'Delete campaigns',
  },
  {
    key: 'settings:read',
    resource: 'settings',
    action: 'read',
    description: 'Access settings pages',
  },
  {
    key: 'rbac:read',
    resource: 'rbac',
    action: 'read',
    description: 'View roles and permissions',
  },
  {
    key: 'rbac:manage',
    resource: 'rbac',
    action: 'manage',
    description: 'Create, edit, and delete roles',
  },
  {
    key: 'users:read',
    resource: 'users',
    action: 'read',
    description: 'View team members and pending invitations',
  },
  {
    key: 'users:invite',
    resource: 'users',
    action: 'invite',
    description: 'Send team member invitations',
  },
  {
    key: 'users:manage',
    resource: 'users',
    action: 'manage',
    description: 'Manage team members and revoke invitations',
  },
  {
    key: 'abac:read',
    resource: 'abac',
    action: 'read',
    description: 'View ABAC policies',
  },
  {
    key: 'abac:manage',
    resource: 'abac',
    action: 'manage',
    description: 'Create, edit, delete, and assign ABAC policies',
  },
  {
    key: 'mailboxes:read',
    resource: 'mailboxes',
    action: 'read',
    description: 'View sender mailboxes',
  },
  {
    key: 'mailboxes:create',
    resource: 'mailboxes',
    action: 'create',
    description: 'Create sender mailboxes',
  },
  {
    key: 'mailboxes:update',
    resource: 'mailboxes',
    action: 'update',
    description: 'Edit and deactivate sender mailboxes',
  },
  {
    key: 'mailboxes:delete',
    resource: 'mailboxes',
    action: 'delete',
    description: 'Delete sender mailboxes',
  },
  {
    key: 'email-campaigns:read',
    resource: 'email-campaigns',
    action: 'read',
    description: 'View email campaigns',
  },
  {
    key: 'email-campaigns:create',
    resource: 'email-campaigns',
    action: 'create',
    description: 'Create email campaigns',
  },
  {
    key: 'email-campaigns:update',
    resource: 'email-campaigns',
    action: 'update',
    description: 'Edit email campaigns',
  },
  {
    key: 'email-campaigns:delete',
    resource: 'email-campaigns',
    action: 'delete',
    description: 'Delete email campaigns directly without approval',
  },
  {
    key: 'email-campaigns:request-delete',
    resource: 'email-campaigns',
    action: 'request-delete',
    description: 'Raise and cancel email campaign delete requests',
  },
  {
    key: 'email-campaigns:approve-delete',
    resource: 'email-campaigns',
    action: 'approve-delete',
    description: 'Review, approve, or reject email campaign delete requests',
  },
  {
    key: 'email-config:read',
    resource: 'email-config',
    action: 'read',
    description: 'View email configuration options',
  },
  {
    key: 'email-config:manage',
    resource: 'email-config',
    action: 'manage',
    description: 'Create, edit, and delete email configuration options',
  },
  {
    key: 'email-templates:read',
    resource: 'email-templates',
    action: 'read',
    description: 'View email templates',
  },
  {
    key: 'email-templates:manage',
    resource: 'email-templates',
    action: 'manage',
    description: 'Create, edit, and delete email templates',
  },
  {
    key: 'analytics:read',
    resource: 'analytics',
    action: 'read',
    description: 'View analytics dashboards and metrics',
  },
  {
    key: 'analytics:manage',
    resource: 'analytics',
    action: 'manage',
    description: 'Create, edit, and delete analytics dashboards and widgets',
  },
  {
    key: 'website:read',
    resource: 'website',
    action: 'read',
    description: 'View website SEO audits and configuration',
  },
  {
    key: 'website:manage',
    resource: 'website',
    action: 'manage',
    description: 'Manage website properties and trigger SEO audits',
  },
  {
    key: 'website:manage-integrations',
    resource: 'website',
    action: 'manage-integrations',
    description:
      'Connect Google accounts and manage PageSpeed Insights API settings',
  },
  {
    key: 'contact-lists:read',
    resource: 'contact-lists',
    action: 'read',
    description: 'View contact lists',
  },
  {
    key: 'contact-lists:create',
    resource: 'contact-lists',
    action: 'create',
    description: 'Create and import contact lists',
  },
  {
    key: 'contact-lists:update',
    resource: 'contact-lists',
    action: 'update',
    description: 'Add contacts and append imports to existing contact lists',
  },
  {
    key: 'whatsapp-lists:read',
    resource: 'whatsapp-lists',
    action: 'read',
    description: 'View WhatsApp contact lists',
  },
  {
    key: 'whatsapp-lists:create',
    resource: 'whatsapp-lists',
    action: 'create',
    description: 'Create and import WhatsApp contact lists',
  },
  {
    key: 'whatsapp-lists:update',
    resource: 'whatsapp-lists',
    action: 'update',
    description: 'Add contacts and append imports to WhatsApp contact lists',
  },
  {
    key: 'whatsapp:read',
    resource: 'whatsapp',
    action: 'read',
    description: 'View WhatsApp module sender connections',
  },
  {
    key: 'whatsapp:manage',
    resource: 'whatsapp',
    action: 'manage',
    description: 'Connect and manage personal WhatsApp sender numbers',
  },
  {
    key: 'whatsapp-campaigns:read',
    resource: 'whatsapp-campaigns',
    action: 'read',
    description: 'View WhatsApp campaigns',
  },
  {
    key: 'whatsapp-campaigns:create',
    resource: 'whatsapp-campaigns',
    action: 'create',
    description: 'Create WhatsApp campaigns',
  },
  {
    key: 'whatsapp-campaigns:update',
    resource: 'whatsapp-campaigns',
    action: 'update',
    description: 'Schedule and update WhatsApp campaigns',
  },
  {
    key: 'whatsapp-campaigns:delete',
    resource: 'whatsapp-campaigns',
    action: 'delete',
    description: 'Delete WhatsApp campaigns',
  },
  {
    key: 'whatsapp-templates:read',
    resource: 'whatsapp-templates',
    action: 'read',
    description: 'View WhatsApp message templates',
  },
  {
    key: 'whatsapp-templates:manage',
    resource: 'whatsapp-templates',
    action: 'manage',
    description: 'Create and manage WhatsApp message templates',
  },
  {
    key: 'manual-lists:read',
    resource: 'manual-lists',
    action: 'read',
    description: 'View manual lists',
  },
  {
    key: 'manual-lists:create',
    resource: 'manual-lists',
    action: 'create',
    description: 'Create manual lists',
  },
  {
    key: 'manual-lists:update',
    resource: 'manual-lists',
    action: 'update',
    description: 'Add rows and append imports to existing manual lists',
  },
  {
    key: 'prospects:read',
    resource: 'prospects',
    action: 'read',
    description: 'View prospects, pipeline board, and field schema',
  },
  {
    key: 'prospects:create',
    resource: 'prospects',
    action: 'create',
    description: 'Create new prospects',
  },
  {
    key: 'prospects:update',
    resource: 'prospects',
    action: 'update',
    description: 'Update prospects, move pipeline cards, and log engagements',
  },
  {
    key: 'prospects:delete',
    resource: 'prospects',
    action: 'delete',
    description: 'Delete prospects directly without approval',
  },
  {
    key: 'prospects:request-delete',
    resource: 'prospects',
    action: 'request-delete',
    description: 'Raise and cancel prospect delete requests',
  },
  {
    key: 'prospects:approve-delete',
    resource: 'prospects',
    action: 'approve-delete',
    description: 'Review, approve, or reject prospect delete requests',
  },
  {
    key: 'prospects:manage-fields',
    resource: 'prospects',
    action: 'manage-fields',
    description:
      'Manage prospect field definitions and pipeline stages (add, edit, delete)',
  },
  {
    key: 'companies:read',
    resource: 'companies',
    action: 'read',
    description: 'View companies list and detail',
  },
  {
    key: 'companies:create',
    resource: 'companies',
    action: 'create',
    description: 'Create companies',
  },
  {
    key: 'companies:update',
    resource: 'companies',
    action: 'update',
    description: 'Edit companies',
  },
  {
    key: 'companies:delete',
    resource: 'companies',
    action: 'delete',
    description: 'Delete companies',
  },
  {
    key: 'companies:manage-fields',
    resource: 'companies',
    action: 'manage-fields',
    description: 'Manage company field definitions',
  },
  {
    key: 'meetings:read',
    resource: 'meetings',
    action: 'read',
    description: 'View scheduled meetings and meeting dashboard',
  },
  {
    key: 'meetings:create',
    resource: 'meetings',
    action: 'create',
    description: 'Schedule new meetings',
  },
  {
    key: 'meetings:update',
    resource: 'meetings',
    action: 'update',
    description: 'Cancel and update meetings',
  },
  {
    key: 'company-config:read',
    resource: 'company-config',
    action: 'read',
    description: 'View company category and location options',
  },
  {
    key: 'company-config:manage',
    resource: 'company-config',
    action: 'manage',
    description:
      'Create, edit, and delete company category and location options',
  },
  {
    key: 'location-settings:read',
    resource: 'location-settings',
    action: 'read',
    description: 'View location API settings',
  },
  {
    key: 'location-settings:manage',
    resource: 'location-settings',
    action: 'manage',
    description: 'Manage location API settings',
  },
  {
    key: 'integrations:manage',
    resource: 'integrations',
    action: 'manage',
    description: 'Connect and disconnect workspace integrations',
  },
  {
    key: 'location:search',
    resource: 'location',
    action: 'search',
    description: 'Search locations for CRM forms',
  },
  {
    key: 'bant-settings:read',
    resource: 'bant-settings',
    action: 'read',
    description: 'View BANT qualification settings',
  },
  {
    key: 'bant-settings:manage',
    resource: 'bant-settings',
    action: 'manage',
    description: 'Configure BANT criteria, scoring, and tier thresholds',
  },
  {
    key: 'audit-logs:read',
    resource: 'audit-logs',
    action: 'read',
    description: 'View workspace audit logs',
  },
  {
    key: 'tenants:read',
    resource: 'tenants',
    action: 'read',
    description: 'View all tenants on the platform',
  },
  {
    key: 'tenants:create',
    resource: 'tenants',
    action: 'create',
    description: 'Create new tenants',
  },
  {
    key: 'tenants:update',
    resource: 'tenants',
    action: 'update',
    description: 'Update tenant settings',
  },
  {
    key: 'tenants:delete',
    resource: 'tenants',
    action: 'delete',
    description: 'Delete tenants',
  },
  {
    key: 'tenants:suspend',
    resource: 'tenants',
    action: 'suspend',
    description: 'Suspend or activate tenants',
  },
  {
    key: 'platform:impersonate',
    resource: 'platform',
    action: 'impersonate',
    description: 'Act within a tenant context as super admin',
  },
  {
    key: 'platform:audit-logs:read',
    resource: 'platform',
    action: 'audit-logs-read',
    description: 'View audit logs across all tenants',
  },
  {
    key: 'platform:forms:read',
    resource: 'platform',
    action: 'forms-read',
    description: 'View platform form definitions',
  },
  {
    key: 'platform:forms:update',
    resource: 'platform',
    action: 'forms-update',
    description: 'Edit platform form definitions',
  },
  {
    key: 'forms:read',
    resource: 'forms',
    action: 'read',
    description: 'View form registry and schemas',
  },
  {
    key: 'forms:update',
    resource: 'forms',
    action: 'update',
    description: 'Extend form schemas with custom fields',
  },
  {
    key: 'organization-limits:read',
    resource: 'organization-limits',
    action: 'read',
    description: 'View organization module limits (platform owner only)',
  },
  {
    key: 'organization-limits:manage',
    resource: 'organization-limits',
    action: 'manage',
    description: 'Manage organization module limits (platform owner only)',
  },
  {
    key: 'inbox:read',
    resource: 'inbox',
    action: 'read',
    description: 'View social inbox conversations',
  },
  {
    key: 'inbox:manage',
    resource: 'inbox',
    action: 'manage',
    description: 'Connect and manage personal WhatsApp inbox',
  },
];

const ROLES: RoleSeed[] = [
  {
    name: 'Super Admin',
    slug: 'super-admin',
    description: 'Full platform access across all tenants',
    permissionKeys: 'all',
  },
  {
    name: 'Admin',
    slug: 'admin',
    description: 'Full access to all features and settings within a tenant',
    permissionKeys: 'all',
  },
  {
    name: 'L1',
    slug: 'l1',
    description:
      'Level-1 approver and website integration manager within a tenant',
    permissionKeys: [
      'settings:read',
      'prospects:read',
      'prospects:approve-delete',
      'bant-settings:read',
      'companies:read',
      'website:read',
      'website:manage',
      'website:manage-integrations',
    ],
  },
  {
    name: 'Editor',
    slug: 'editor',
    description: 'Manage campaigns and view settings',
    permissionKeys: [
      'campaigns:read',
      'campaigns:create',
      'campaigns:update',
      'campaigns:delete',
      'settings:read',
      'mailboxes:read',
      'mailboxes:create',
      'mailboxes:update',
      'mailboxes:delete',
      'email-campaigns:read',
      'email-campaigns:create',
      'email-campaigns:update',
      'email-campaigns:request-delete',
      'contact-lists:read',
      'contact-lists:create',
      'contact-lists:update',
      'whatsapp-lists:read',
      'whatsapp-lists:create',
      'whatsapp-lists:update',
      'whatsapp:read',
      'whatsapp:manage',
      'whatsapp-campaigns:read',
      'whatsapp-campaigns:create',
      'whatsapp-campaigns:update',
      'whatsapp-campaigns:delete',
      'whatsapp-templates:read',
      'whatsapp-templates:manage',
      'manual-lists:read',
      'manual-lists:create',
      'manual-lists:update',
      'prospects:read',
      'prospects:create',
      'prospects:update',
      'prospects:request-delete',
      'companies:read',
      'companies:create',
      'companies:update',
      'forms:read',
      'forms:update',
      'meetings:read',
      'meetings:create',
      'meetings:update',
      'company-config:read',
      'company-config:manage',
      'location-settings:read',
      'location-settings:manage',
      'location:search',
      'integrations:manage',
      'bant-settings:read',
      'bant-settings:manage',
      'email-config:read',
      'email-config:manage',
      'email-templates:read',
      'email-templates:manage',
      'analytics:read',
      'analytics:manage',
      'website:read',
      'inbox:read',
      'inbox:manage',
    ],
  },
  {
    name: 'Viewer',
    slug: 'viewer',
    description: 'Read-only access to campaigns and settings',
    permissionKeys: [
      'campaigns:read',
      'settings:read',
      'mailboxes:read',
      'email-campaigns:read',
      'contact-lists:read',
      'whatsapp-lists:read',
      'whatsapp:read',
      'whatsapp-campaigns:read',
      'whatsapp-templates:read',
      'manual-lists:read',
      'prospects:read',
      'companies:read',
      'meetings:read',
      'company-config:read',
      'bant-settings:read',
      'location:search',
      'email-config:read',
      'email-templates:read',
      'analytics:read',
      'website:read',
      'inbox:read',
    ],
  },
];

@Injectable()
export class RbacSeedService implements OnModuleInit {
  constructor(
    private readonly permissionsRepository: PermissionsRepository,
    private readonly rolesRepository: RolesRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedPermissions();
    await this.seedRoles();
    await this.migrateManageFieldsToFormsPermissions();
    await this.syncSuperAdminPermissions();
    await this.syncAdminPermissions();
    await this.syncL1Permissions();
    await this.syncEditorPermissions();
    await this.syncViewerPermissions();
  }

  private async seedPermissions(): Promise<void> {
    for (const seed of PERMISSIONS) {
      const existing = await this.permissionsRepository.findByKey(seed.key);
      if (existing) {
        continue;
      }

      const permission = this.permissionsRepository.create({
        key: seed.key,
        resource: seed.resource,
        action: seed.action,
        description: seed.description,
      });

      await this.permissionsRepository.saveIgnoringDuplicateKey(permission);
    }
  }

  private async seedRoles(): Promise<void> {
    const allPermissions = await this.permissionsRepository.findAll();
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p.id]));

    for (const seed of ROLES) {
      const existing = await this.rolesRepository.findBySlug(seed.slug);
      if (existing) {
        continue;
      }

      const role = this.rolesRepository.create({
        name: seed.name,
        slug: seed.slug,
        description: seed.description,
        isSystem: true,
      });

      const saved = await this.rolesRepository.save(role);

      const permissionIds =
        seed.permissionKeys === 'all'
          ? allPermissions.map((p) => p.id)
          : seed.permissionKeys
              .map((key) => permissionByKey.get(key))
              .filter((id): id is string => id !== undefined);

      await this.rolesRepository.replacePermissions(saved.id, permissionIds);
    }
  }

  private async syncSuperAdminPermissions(): Promise<void> {
    const superAdminRole = await this.rolesRepository.findBySlug('super-admin');
    if (!superAdminRole) {
      return;
    }

    const allPermissions = await this.permissionsRepository.findAll();
    await this.rolesRepository.replacePermissions(
      superAdminRole.id,
      allPermissions.map((permission) => permission.id),
    );
  }

  private async syncAdminPermissions(): Promise<void> {
    const adminRole = await this.rolesRepository.findBySlug('admin');
    if (!adminRole) {
      return;
    }

    const allPermissions = await this.permissionsRepository.findAll();
    const tenantPermissions = allPermissions.filter(
      (permission) =>
        !permission.key.startsWith('tenants:') &&
        !permission.key.startsWith('platform:') &&
        !permission.key.startsWith('organization-limits:'),
    );

    await this.rolesRepository.replacePermissions(
      adminRole.id,
      tenantPermissions.map((permission) => permission.id),
    );
  }

  private async syncL1Permissions(): Promise<void> {
    await this.syncRolePermissions('l1', [
      'settings:read',
      'prospects:read',
      'prospects:approve-delete',
      'email-campaigns:read',
      'email-campaigns:approve-delete',
      'bant-settings:read',
      'companies:read',
      'website:read',
      'website:manage',
      'website:manage-integrations',
    ]);
  }

  private async syncEditorPermissions(): Promise<void> {
    await this.syncRolePermissions('editor', [
      'campaigns:read',
      'campaigns:create',
      'campaigns:update',
      'campaigns:delete',
      'settings:read',
      'mailboxes:read',
      'mailboxes:create',
      'mailboxes:update',
      'mailboxes:delete',
      'email-campaigns:read',
      'email-campaigns:create',
      'email-campaigns:update',
      'email-campaigns:request-delete',
      'contact-lists:read',
      'contact-lists:create',
      'contact-lists:update',
      'whatsapp-lists:read',
      'whatsapp-lists:create',
      'whatsapp-lists:update',
      'whatsapp:read',
      'whatsapp:manage',
      'whatsapp-campaigns:read',
      'whatsapp-campaigns:create',
      'whatsapp-campaigns:update',
      'whatsapp-campaigns:delete',
      'whatsapp-templates:read',
      'whatsapp-templates:manage',
      'manual-lists:read',
      'manual-lists:create',
      'manual-lists:update',
      'prospects:read',
      'prospects:create',
      'prospects:update',
      'companies:read',
      'companies:create',
      'companies:update',
      'forms:read',
      'forms:update',
      'meetings:read',
      'meetings:create',
      'meetings:update',
      'company-config:read',
      'company-config:manage',
      'location-settings:read',
      'location-settings:manage',
      'location:search',
      'integrations:manage',
      'bant-settings:read',
      'bant-settings:manage',
      'email-config:read',
      'email-config:manage',
      'email-templates:read',
      'email-templates:manage',
      'analytics:read',
      'analytics:manage',
      'website:read',
      'inbox:read',
      'inbox:manage',
    ]);
  }

  private async syncViewerPermissions(): Promise<void> {
    await this.syncRolePermissions('viewer', [
      'campaigns:read',
      'settings:read',
      'mailboxes:read',
      'email-campaigns:read',
      'contact-lists:read',
      'whatsapp-lists:read',
      'whatsapp:read',
      'whatsapp-campaigns:read',
      'whatsapp-templates:read',
      'manual-lists:read',
      'prospects:read',
      'companies:read',
      'meetings:read',
      'company-config:read',
      'bant-settings:read',
      'location:search',
      'email-config:read',
      'email-templates:read',
      'analytics:read',
      'website:read',
      'inbox:read',
    ]);
  }

  private async migrateManageFieldsToFormsPermissions(): Promise<void> {
    const formsRead = await this.permissionsRepository.findByKey('forms:read');
    const formsUpdate =
      await this.permissionsRepository.findByKey('forms:update');

    if (!formsRead || !formsUpdate) {
      return;
    }

    const legacyKeys = ['prospects:manage-fields', 'companies:manage-fields'];

    for (const legacyKey of legacyKeys) {
      const legacyPermission =
        await this.permissionsRepository.findByKey(legacyKey);

      if (!legacyPermission) {
        continue;
      }

      await this.rolesRepository.addPermissionToRolesHaving(
        legacyPermission.id,
        formsRead.id,
      );
      await this.rolesRepository.addPermissionToRolesHaving(
        legacyPermission.id,
        formsUpdate.id,
      );
    }
  }

  private async syncRolePermissions(
    slug: string,
    permissionKeys: string[],
  ): Promise<void> {
    const role = await this.rolesRepository.findBySlug(slug);
    if (!role) {
      return;
    }

    const allPermissions = await this.permissionsRepository.findAll();
    const permissionByKey = new Map(allPermissions.map((p) => [p.key, p.id]));
    const permissionIds = permissionKeys
      .map((key) => permissionByKey.get(key))
      .filter((id): id is string => id !== undefined);

    await this.rolesRepository.replacePermissions(role.id, permissionIds);
  }
}
