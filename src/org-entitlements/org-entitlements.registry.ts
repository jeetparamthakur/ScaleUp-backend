export const ORG_MODULES = [
  'dashboard',
  'email',
  'whatsapp',
  'inbox',
  'crm',
  'website',
  'smm',
  'settings',
] as const;

export type OrgModule = (typeof ORG_MODULES)[number];

export const ORG_LIMIT_COUNT_QUERIES = [
  'mailboxes',
  'emailCampaigns',
  'prospects',
  'companies',
  'websiteProjects',
  'members',
] as const;

export type OrgLimitCountQuery = (typeof ORG_LIMIT_COUNT_QUERIES)[number];

export interface OrgLimitDefinition {
  module: OrgModule;
  label: string;
  countQuery: OrgLimitCountQuery;
  defaultCap: number | null;
}

export const ORG_LIMIT_DEFINITIONS = {
  'email.mailboxes': {
    module: 'email',
    label: 'Mailboxes',
    countQuery: 'mailboxes',
    defaultCap: 50,
  },
  'email.campaigns': {
    module: 'email',
    label: 'Campaigns',
    countQuery: 'emailCampaigns',
    defaultCap: 100,
  },
  'crm.prospects': {
    module: 'crm',
    label: 'Prospects',
    countQuery: 'prospects',
    defaultCap: 10000,
  },
  'crm.companies': {
    module: 'crm',
    label: 'Companies',
    countQuery: 'companies',
    defaultCap: 10000,
  },
  'website.projects': {
    module: 'website',
    label: 'Projects',
    countQuery: 'websiteProjects',
    defaultCap: 50,
  },
  'settings.members': {
    module: 'settings',
    label: 'Team members',
    countQuery: 'members',
    defaultCap: 100,
  },
} as const satisfies Record<string, OrgLimitDefinition>;

export type OrgLimitKey = keyof typeof ORG_LIMIT_DEFINITIONS;

export const ORG_LIMIT_KEYS = Object.keys(
  ORG_LIMIT_DEFINITIONS,
) as OrgLimitKey[];

export function isOrgModule(value: string): value is OrgModule {
  return (ORG_MODULES as readonly string[]).includes(value);
}

export function isOrgLimitKey(value: string): value is OrgLimitKey {
  return value in ORG_LIMIT_DEFINITIONS;
}

export function getDefaultPlatformCaps(): Record<OrgLimitKey, number | null> {
  return ORG_LIMIT_KEYS.reduce(
    (acc, key) => {
      acc[key] = ORG_LIMIT_DEFINITIONS[key].defaultCap;
      return acc;
    },
    {} as Record<OrgLimitKey, number | null>,
  );
}

export function getDefaultEnabledModules(): OrgModule[] {
  return [...ORG_MODULES];
}
