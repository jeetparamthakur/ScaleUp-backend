import { WhatsappCampaignEntity } from '../entities/whatsapp-campaign.entity';
import {
  computeNextSendingWindowOpen,
  getEffectiveWindowStartMinutes,
  isWhatsappCampaignInSendingWindow,
} from './whatsapp-campaign-sending-window.util';

function buildCampaign(
  partial: Partial<WhatsappCampaignEntity> = {},
): WhatsappCampaignEntity {
  const campaign = new WhatsappCampaignEntity();
  campaign.timezone = 'UTC';
  campaign.sendingWindowStartMinutes = 9 * 60;
  campaign.sendingWindowEndMinutes = 17 * 60;
  campaign.launchAt = new Date('2026-06-01T14:00:00.000Z');
  Object.assign(campaign, partial);
  return campaign;
}

describe('whatsapp-campaign-sending-window.util', () => {
  it('uses launch time as effective start on launch day', () => {
    const campaign = buildCampaign({
      sendingWindowStartMinutes: 9 * 60,
      launchAt: new Date('2026-06-01T14:00:00.000Z'),
    });

    const launchDayMorning = new Date('2026-06-01T10:00:00.000Z');
    expect(getEffectiveWindowStartMinutes(campaign, launchDayMorning)).toBe(
      14 * 60,
    );
  });

  it('uses stored window start on days after launch', () => {
    const campaign = buildCampaign({
      launchAt: new Date('2026-06-01T14:00:00.000Z'),
    });
    const nextDay = new Date('2026-06-02T10:00:00.000Z');
    expect(getEffectiveWindowStartMinutes(campaign, nextDay)).toBe(9 * 60);
  });

  it('blocks sends outside the daily window', () => {
    const campaign = buildCampaign({
      launchAt: new Date('2026-06-01T08:00:00.000Z'),
    });
    const beforeWindow = new Date('2026-06-01T08:30:00.000Z');
    const insideWindow = new Date('2026-06-01T10:00:00.000Z');
    const afterWindow = new Date('2026-06-01T18:00:00.000Z');

    expect(isWhatsappCampaignInSendingWindow(campaign, beforeWindow)).toBe(
      false,
    );
    expect(isWhatsappCampaignInSendingWindow(campaign, insideWindow)).toBe(
      true,
    );
    expect(isWhatsappCampaignInSendingWindow(campaign, afterWindow)).toBe(
      false,
    );
  });

  it('defers to the next day window start after end time', () => {
    const campaign = buildCampaign({
      launchAt: new Date('2026-06-01T08:00:00.000Z'),
    });
    const afterWindow = new Date('2026-06-01T18:00:00.000Z');
    const nextOpen = computeNextSendingWindowOpen(campaign, afterWindow);

    expect(nextOpen.toISOString()).toBe('2026-06-02T09:00:00.000Z');
  });
});
