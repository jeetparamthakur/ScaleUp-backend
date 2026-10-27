import { normalizeAppPassword } from '../mailboxes/providers/mailbox-password.util';
import { GMAIL_SMTP_PRESET } from '../mailboxes/providers/provider-smtp-presets';

export interface SystemSmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
}

export type SystemMailSmtpKind = 'gmail' | 'smtp';

export interface SystemMailConfig {
  /** Primary profile (first in try order); mirrors legacy `smtp` config key. */
  smtp: SystemSmtpConfig;
  smtpProfiles: SystemSmtpConfig[];
  preferSmtpOverResend: boolean;
  useSmtp: boolean;
}

export interface SystemMailEnv {
  gmailUser?: string;
  gmailAppPassword?: string;
  gmailFrom?: string;
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPass?: string;
  smtpPassword?: string;
  smtpFrom?: string;
  emailFrom?: string;
  smtpSecure?: string;
  /** Comma-separated try order, e.g. `gmail,smtp` or `smtp,gmail`. Default `gmail,smtp`. */
  smtpOrder?: string;
}

function hasExplicitSmtpCredentials(env: SystemMailEnv): boolean {
  const host = env.smtpHost?.trim();
  const user = env.smtpUser?.trim();
  const pass = (env.smtpPass ?? env.smtpPassword)?.trim();
  return Boolean(host && user && pass);
}

function resolveSharedFrom(env: SystemMailEnv): string | null {
  return env.smtpFrom?.trim() || env.emailFrom?.trim() || null;
}

function buildGmailProfile(
  env: SystemMailEnv,
  gmailUser: string,
  gmailPassword: string,
): SystemSmtpConfig {
  const from = env.gmailFrom?.trim() || gmailUser;
  return {
    host: GMAIL_SMTP_PRESET.host,
    port: GMAIL_SMTP_PRESET.port,
    user: gmailUser,
    pass: gmailPassword,
    from,
    secure: GMAIL_SMTP_PRESET.secure,
  };
}

function buildExplicitSmtpProfile(env: SystemMailEnv): SystemSmtpConfig {
  const host = env.smtpHost?.trim() ?? '';
  const user = env.smtpUser?.trim() ?? '';
  const pass = (env.smtpPass ?? env.smtpPassword)?.trim() ?? '';
  const sharedFrom = resolveSharedFrom(env);
  return {
    host,
    port: parseInt(env.smtpPort ?? '587', 10),
    user,
    pass,
    from: sharedFrom ?? user,
    secure: env.smtpSecure === 'true',
  };
}

const DEFAULT_SMTP_ORDER: SystemMailSmtpKind[] = ['gmail', 'smtp'];

function parseSmtpOrder(raw: string | undefined): SystemMailSmtpKind[] {
  const tokens = (raw ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(
      (part): part is SystemMailSmtpKind => part === 'gmail' || part === 'smtp',
    );

  if (tokens.length === 0) {
    return [...DEFAULT_SMTP_ORDER];
  }

  const seen = new Set<SystemMailSmtpKind>();
  const order: SystemMailSmtpKind[] = [];
  for (const token of tokens) {
    if (!seen.has(token)) {
      seen.add(token);
      order.push(token);
    }
  }
  for (const fallback of DEFAULT_SMTP_ORDER) {
    if (!seen.has(fallback)) {
      order.push(fallback);
    }
  }
  return order;
}

const EMPTY_SMTP: SystemSmtpConfig = {
  host: '',
  port: 587,
  user: '',
  pass: '',
  from: 'noreply@markos.dev',
  secure: false,
};

export function resolveSystemMailConfig(env: SystemMailEnv): SystemMailConfig {
  const gmailUser = env.gmailUser?.trim().toLowerCase() ?? '';
  const rawGmailPassword = env.gmailAppPassword?.trim() ?? '';
  const gmailPassword = rawGmailPassword
    ? normalizeAppPassword(rawGmailPassword)
    : '';
  const gmailConfigured = Boolean(gmailUser && gmailPassword);
  const explicitConfigured = hasExplicitSmtpCredentials(env);

  const gmailProfile = gmailConfigured
    ? buildGmailProfile(env, gmailUser, gmailPassword)
    : null;
  const explicitProfile = explicitConfigured
    ? buildExplicitSmtpProfile(env)
    : null;

  const order = parseSmtpOrder(env.smtpOrder);
  const smtpProfiles: SystemSmtpConfig[] = [];
  for (const kind of order) {
    if (kind === 'gmail' && gmailProfile) {
      smtpProfiles.push(gmailProfile);
    }
    if (kind === 'smtp' && explicitProfile) {
      smtpProfiles.push(explicitProfile);
    }
  }

  const useSmtp = smtpProfiles.length > 0;
  const smtp = useSmtp ? smtpProfiles[0] : EMPTY_SMTP;

  return {
    smtp,
    smtpProfiles,
    preferSmtpOverResend: useSmtp,
    useSmtp,
  };
}
