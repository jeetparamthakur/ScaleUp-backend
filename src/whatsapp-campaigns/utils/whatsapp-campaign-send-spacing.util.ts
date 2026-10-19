import type { WhatsappCampaignEntity } from '../entities/whatsapp-campaign.entity';

const RANDOM_MIN_SECONDS = 60;
const RANDOM_MAX_SECONDS = 180;

function randomGapSeconds(): number {
  return (
    RANDOM_MIN_SECONDS +
    Math.floor(Math.random() * (RANDOM_MAX_SECONDS - RANDOM_MIN_SECONDS + 1))
  );
}

export function computeNextSendEligibleAt(
  campaign: WhatsappCampaignEntity,
  from: Date,
): Date {
  const gapSeconds =
    campaign.sendIntervalSeconds != null
      ? campaign.sendIntervalSeconds
      : randomGapSeconds();

  return new Date(from.getTime() + gapSeconds * 1000);
}
