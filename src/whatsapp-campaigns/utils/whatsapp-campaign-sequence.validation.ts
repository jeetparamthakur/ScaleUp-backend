import { BadRequestException } from '@nestjs/common';

export interface WhatsappSequenceStepInput {
  stepOrder: number;
  body: string;
  delayDays: number;
  delayMode?: 'relative' | 'absolute';
  scheduledDate?: string;
}

export function validateWhatsappCampaignSteps(
  steps: WhatsappSequenceStepInput[],
): void {
  if (steps.length === 0) {
    throw new BadRequestException('Sequence must contain at least one step');
  }

  const sorted = [...steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const orders = sorted.map((step) => step.stepOrder);

  for (let index = 0; index < orders.length; index += 1) {
    if (orders[index] !== index + 1) {
      throw new BadRequestException(
        'Sequence steps must have consecutive stepOrder values starting at 1',
      );
    }
  }

  for (const step of sorted) {
    if (!step.body.trim()) {
      throw new BadRequestException(
        'Each sequence step must have a message body',
      );
    }
  }

  const initial = sorted[0];
  if ((initial.delayMode ?? 'relative') !== 'relative') {
    throw new BadRequestException(
      'Initial outreach step must use relative timing',
    );
  }

  if (initial.delayDays !== 0) {
    throw new BadRequestException(
      'Initial outreach step must have delayDays of 0',
    );
  }

  for (const step of sorted.slice(1)) {
    validateFollowUpTiming(step);
  }
}

function validateFollowUpTiming(step: WhatsappSequenceStepInput): void {
  const delayMode = step.delayMode ?? 'relative';

  if (delayMode === 'relative') {
    if (step.delayDays < 1) {
      throw new BadRequestException(
        'Follow-up steps with relative timing must have delayDays of at least 1',
      );
    }
    return;
  }

  if (!step.scheduledDate) {
    throw new BadRequestException(
      'Follow-up steps with absolute timing must include scheduledDate',
    );
  }
}

export function buildWhatsappSequenceStepEntities(
  steps: WhatsappSequenceStepInput[],
  campaignId: string,
): Array<{
  campaignId: string;
  stepOrder: number;
  body: string;
  delayMode: 'relative' | 'absolute';
  delayDays: number;
  scheduledDate: string | null;
}> {
  return [...steps]
    .sort((a, b) => a.stepOrder - b.stepOrder)
    .map((step) => {
      if (step.stepOrder === 1) {
        return {
          campaignId,
          stepOrder: step.stepOrder,
          body: step.body.trim(),
          delayMode: 'relative' as const,
          delayDays: 0,
          scheduledDate: null,
        };
      }

      const delayMode = step.delayMode ?? 'relative';

      if (delayMode === 'absolute') {
        return {
          campaignId,
          stepOrder: step.stepOrder,
          body: step.body.trim(),
          delayMode: 'absolute' as const,
          delayDays: 0,
          scheduledDate: step.scheduledDate ?? null,
        };
      }

      return {
        campaignId,
        stepOrder: step.stepOrder,
        body: step.body.trim(),
        delayMode: 'relative' as const,
        delayDays: step.delayDays,
        scheduledDate: null,
      };
    });
}
