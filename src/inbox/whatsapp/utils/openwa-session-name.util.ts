import { createHash } from 'node:crypto';

export function buildOpenWaSessionName(
  organizationId: string,
  userId: string,
): string {
  const digest = createHash('sha256')
    .update(`${organizationId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
  return `m-${digest}`;
}

/** Campaign / WhatsApp-module sender session (multiple per user). */
export function buildOpenWaCampaignSessionName(
  organizationId: string,
  userId: string,
  connectionId: string,
): string {
  const digest = createHash('sha256')
    .update(`${organizationId}:${userId}:${connectionId}`)
    .digest('hex')
    .slice(0, 31);
  return `w-${digest}`;
}
