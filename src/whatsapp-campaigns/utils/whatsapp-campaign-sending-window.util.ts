import {
  addDaysToDateKey,
  createDateInTimezone,
  getCalendarDateKeyInTimezone,
  getMinutesFromMidnightInTimezone,
} from '../../email-campaigns/campaign-schedule.util';
import type { WhatsappCampaignEntity } from '../entities/whatsapp-campaign.entity';
import { resolveCampaignTimezone } from './whatsapp-campaign-daily.util';

export function hasWhatsappCampaignSendingWindow(
  campaign: WhatsappCampaignEntity,
): boolean {
  return (
    campaign.sendingWindowStartMinutes != null &&
    campaign.sendingWindowEndMinutes != null &&
    Boolean(campaign.timezone?.trim())
  );
}

export function getEffectiveWindowStartMinutes(
  campaign: WhatsappCampaignEntity,
  now: Date,
): number {
  const timezone = resolveCampaignTimezone(campaign);
  const windowStart = campaign.sendingWindowStartMinutes ?? 0;
  const todayKey = getCalendarDateKeyInTimezone(now, timezone);

  if (!campaign.launchAt) {
    return windowStart;
  }

  const launchKey = getCalendarDateKeyInTimezone(campaign.launchAt, timezone);
  if (todayKey !== launchKey) {
    return windowStart;
  }

  const launchMinutes = getMinutesFromMidnightInTimezone(
    campaign.launchAt,
    timezone,
  );
  return Math.max(windowStart, launchMinutes);
}

export function isWhatsappCampaignInSendingWindow(
  campaign: WhatsappCampaignEntity,
  now: Date,
): boolean {
  if (!hasWhatsappCampaignSendingWindow(campaign)) {
    return false;
  }

  if (campaign.launchAt && campaign.launchAt.getTime() > now.getTime()) {
    return false;
  }

  const timezone = resolveCampaignTimezone(campaign);
  const currentMinutes = getMinutesFromMidnightInTimezone(now, timezone);
  const effectiveStart = getEffectiveWindowStartMinutes(campaign, now);
  const endMinutes = campaign.sendingWindowEndMinutes!;

  return currentMinutes >= effectiveStart && currentMinutes < endMinutes;
}

export function computeNextSendingWindowOpen(
  campaign: WhatsappCampaignEntity,
  now: Date,
): Date {
  if (!hasWhatsappCampaignSendingWindow(campaign)) {
    return now;
  }

  const timezone = resolveCampaignTimezone(campaign);
  const todayKey = getCalendarDateKeyInTimezone(now, timezone);
  const windowStart = campaign.sendingWindowStartMinutes!;
  const endMinutes = campaign.sendingWindowEndMinutes!;
  const currentMinutes = getMinutesFromMidnightInTimezone(now, timezone);
  const effectiveStart = getEffectiveWindowStartMinutes(campaign, now);

  if (currentMinutes < effectiveStart && currentMinutes < endMinutes) {
    const todayOpen = createDateInTimezone(todayKey, effectiveStart, timezone);
    if (
      campaign.launchAt &&
      todayOpen.getTime() < campaign.launchAt.getTime()
    ) {
      return campaign.launchAt;
    }
    if (todayOpen.getTime() > now.getTime()) {
      return todayOpen;
    }
  }

  const nextDayKey = addDaysToDateKey(todayKey, 1);
  let candidate = createDateInTimezone(nextDayKey, windowStart, timezone);

  if (campaign.launchAt) {
    const launchKey = getCalendarDateKeyInTimezone(campaign.launchAt, timezone);
    if (
      launchKey === nextDayKey &&
      candidate.getTime() < campaign.launchAt.getTime()
    ) {
      candidate = campaign.launchAt;
    }
  }

  return candidate;
}
