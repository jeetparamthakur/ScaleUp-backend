import {
  isLocalTrackingHostname,
  isTrackingBaseUrlPubliclyReachable,
  parseTrackingBaseUrl,
} from '../../../email-campaigns/tracking-config.util';

export interface ResolveOpenWaWebhookBaseUrlOptions {
  openwaWebhookBaseUrl?: string;
  backendUrl?: string;
  trackingBaseUrl?: string;
  defaultPort?: number;
}

export function isOpenWaWebhookBaseUrlPubliclyReachable(
  webhookBaseUrl: string,
): boolean {
  const parsed = parseTrackingBaseUrl(webhookBaseUrl);
  if (!parsed) {
    return false;
  }

  return !isLocalTrackingHostname(parsed.hostname);
}

function normalizeWebhookBaseUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, '');
  const parsed = parseTrackingBaseUrl(trimmed);
  if (!parsed) {
    return trimmed;
  }

  if (
    isLocalTrackingHostname(parsed.hostname) &&
    parsed.hostname === 'localhost'
  ) {
    parsed.hostname = '127.0.0.1';
    return parsed.toString().replace(/\/$/, '');
  }

  return trimmed;
}

export function buildOpenWaWebhookBaseUrlCandidates(
  options: ResolveOpenWaWebhookBaseUrlOptions,
): string[] {
  const primary = normalizeWebhookBaseUrl(
    resolveEffectiveOpenWaWebhookBaseUrl(options),
  );
  const candidates = [primary];

  const parsed = parseTrackingBaseUrl(primary);
  if (parsed && isLocalTrackingHostname(parsed.hostname)) {
    const altHost = parsed.hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1';
    const alt = new URL(primary);
    alt.hostname = altHost;
    const altBase = alt.toString().replace(/\/$/, '');
    if (!candidates.includes(altBase)) {
      candidates.push(altBase);
    }
  }

  return candidates;
}

export function resolveEffectiveOpenWaWebhookBaseUrl(
  options: ResolveOpenWaWebhookBaseUrlOptions,
): string {
  const explicit = options.openwaWebhookBaseUrl?.trim();
  if (explicit) {
    return normalizeWebhookBaseUrl(explicit);
  }

  const backend = options.backendUrl?.trim().replace(/\/+$/, '');
  if (backend && isOpenWaWebhookBaseUrlPubliclyReachable(backend)) {
    return normalizeWebhookBaseUrl(backend);
  }

  const tracking = options.trackingBaseUrl?.trim().replace(/\/+$/, '');
  if (tracking && isTrackingBaseUrlPubliclyReachable(tracking)) {
    return normalizeWebhookBaseUrl(tracking);
  }

  if (backend) {
    return normalizeWebhookBaseUrl(backend);
  }

  const port = options.defaultPort ?? 3008;
  return `http://127.0.0.1:${port}`;
}

export const OPENWA_WEBHOOK_LOCAL_DEV_HINT =
  'Set OPENWA_WEBHOOK_BASE_URL to a public URL (for example an ngrok tunnel), ' +
  'or add the host to SSRF_ALLOWED_HOSTS on the OpenWA server for local development.';
