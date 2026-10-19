import { Injectable } from '@nestjs/common';
import type { WhatsappTemplateStepEntity } from '../entities/whatsapp-template-step.entity';
import type { WhatsappTemplateEntity } from '../entities/whatsapp-template.entity';
import type {
  WhatsappTemplateDelayMode,
  WhatsappTemplateType,
  WhatsappTemplateVisibility,
} from '../types/whatsapp-template.types';

export interface WhatsappTemplateStepResponse {
  id: string;
  stepOrder: number;
  body: string;
  delayMode: WhatsappTemplateDelayMode;
  delayDays: number;
  scheduledDate: string | null;
}

export interface WhatsappTemplateResponse {
  id: string;
  name: string;
  description: string | null;
  type: WhatsappTemplateType;
  visibility: WhatsappTemplateVisibility;
  isActive: boolean;
  createdByUserId: string;
  steps: WhatsappTemplateStepResponse[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class WhatsappTemplateMapper {
  toResponse(entity: WhatsappTemplateEntity): WhatsappTemplateResponse {
    const steps = [...(entity.steps ?? [])].sort(
      (a, b) => a.stepOrder - b.stepOrder,
    );

    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      type: entity.type,
      visibility: entity.visibility,
      isActive: entity.isActive,
      createdByUserId: entity.createdByUserId,
      steps: steps.map((step) => this.toStepResponse(step)),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private toStepResponse(
    step: WhatsappTemplateStepEntity,
  ): WhatsappTemplateStepResponse {
    return {
      id: step.id,
      stepOrder: step.stepOrder,
      body: step.body,
      delayMode: step.delayMode,
      delayDays: step.delayDays,
      scheduledDate: step.scheduledDate,
    };
  }
}
