import { BadRequestException } from '@nestjs/common';
import {
  buildWhatsappSequenceStepEntities,
  validateWhatsappCampaignSteps,
} from './whatsapp-campaign-sequence.validation';

describe('validateWhatsappCampaignSteps', () => {
  it('accepts initial step plus relative follow-up', () => {
    expect(() =>
      validateWhatsappCampaignSteps([
        {
          stepOrder: 1,
          body: 'Hello',
          delayDays: 0,
          delayMode: 'relative',
        },
        {
          stepOrder: 2,
          body: 'Follow up',
          delayDays: 3,
          delayMode: 'relative',
        },
      ]),
    ).not.toThrow();
  });

  it('rejects non-consecutive step orders', () => {
    expect(() =>
      validateWhatsappCampaignSteps([
        { stepOrder: 1, body: 'A', delayDays: 0 },
        { stepOrder: 3, body: 'B', delayDays: 2 },
      ]),
    ).toThrow(BadRequestException);
  });

  it('rejects follow-up with relative delay below 1', () => {
    expect(() =>
      validateWhatsappCampaignSteps([
        { stepOrder: 1, body: 'A', delayDays: 0 },
        { stepOrder: 2, body: 'B', delayDays: 0, delayMode: 'relative' },
      ]),
    ).toThrow(BadRequestException);
  });
});

describe('buildWhatsappSequenceStepEntities', () => {
  it('maps absolute follow-up scheduled date', () => {
    const rows = buildWhatsappSequenceStepEntities(
      [
        { stepOrder: 1, body: 'Hi', delayDays: 0 },
        {
          stepOrder: 2,
          body: 'Later',
          delayDays: 0,
          delayMode: 'absolute',
          scheduledDate: '2026-12-01',
        },
      ],
      'campaign-1',
    );

    expect(rows[1]).toMatchObject({
      campaignId: 'campaign-1',
      stepOrder: 2,
      delayMode: 'absolute',
      scheduledDate: '2026-12-01',
    });
  });
});
