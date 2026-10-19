import {
  addDaysToDateKey,
  createDateInTimezone,
  getCalendarDateKeyInTimezone,
} from '../../email-campaigns/campaign-schedule.util';
import type { WhatsappCampaignEntity } from '../entities/whatsapp-campaign.entity';

export function resolveCampaignTimezone(
  campaign: WhatsappCampaignEntity,
): string {
  const trimmed = campaign.timezone?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'UTC';
}

export function getCampaignCalendarDateKey(
  campaign: WhatsappCampaignEntity,
  now: Date,
): string {
  return getCalendarDateKeyInTimezone(now, resolveCampaignTimezone(campaign));
}

export function applyCampaignDailyReset(
  campaign: WhatsappCampaignEntity,
  now: Date,
): boolean {
  const todayKey = getCampaignCalendarDateKey(campaign, now);

  if (campaign.sendsTodayDate !== todayKey) {
    campaign.sendsTodayDate = todayKey;
    campaign.sendsTodayCount = 0;
    return true;
  }

  return false;
}

export function getCampaignRemainingDailyBatch(
  campaign: WhatsappCampaignEntity,
  now: Date,
): number {
  applyCampaignDailyReset(campaign, now);
  return Math.max(0, campaign.dailyBatchSize - campaign.sendsTodayCount);
}

export function incrementCampaignDailySendCount(
  campaign: WhatsappCampaignEntity,
  now: Date,
): void {
  applyCampaignDailyReset(campaign, now);
  campaign.sendsTodayCount += 1;
}

export function computeNextDailyBatchWindowStart(
  campaign: WhatsappCampaignEntity,
  now: Date,
): Date {
  const timezone = resolveCampaignTimezone(campaign);
  const todayKey = getCalendarDateKeyInTimezone(now, timezone);
  const nextDayKey = addDaysToDateKey(todayKey, 1);
  const windowStart = campaign.sendingWindowStartMinutes ?? 0;
  return createDateInTimezone(nextDayKey, windowStart, timezone);
}
