import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { hasPermission } from '../auth/auth-access.utils';
import { requireOrganizationId } from '../common/organization/require-organization-id';
import {
  buildWhatsappSequenceStepEntities,
  validateWhatsappCampaignSteps,
} from '../whatsapp-campaigns/utils/whatsapp-campaign-sequence.validation';
import type {
  CreateWhatsappTemplateDto,
  CreateWhatsappTemplateStepDto,
  UpdateWhatsappTemplateDto,
} from './dto/whatsapp-template.dto';
import { WhatsappTemplateStepEntity } from './entities/whatsapp-template-step.entity';
import { WhatsappTemplateEntity } from './entities/whatsapp-template.entity';
import {
  WhatsappTemplateMapper,
  type WhatsappTemplateResponse,
} from './mappers/whatsapp-template.mapper';
import type { WhatsappTemplateType } from './types/whatsapp-template.types';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';

@Injectable()
export class WhatsappTemplatesService {
  constructor(
    private readonly templatesRepository: WhatsappTemplatesRepository,
    private readonly templateMapper: WhatsappTemplateMapper,
  ) {}

  async findAll(
    organizationId: string | null,
    user: AuthUser,
    options: { type?: WhatsappTemplateType; includeInactive?: boolean },
  ): Promise<WhatsappTemplateResponse[]> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const templates = await this.templatesRepository.findVisibleForUser(
      resolvedOrganizationId,
      user.id,
      options,
    );

    return templates.map((template) =>
      this.templateMapper.toResponse(template),
    );
  }

  async findOne(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappTemplateResponse> {
    const template = await this.requireVisibleTemplate(
      id,
      organizationId,
      user,
    );
    return this.templateMapper.toResponse(template);
  }

  async create(
    dto: CreateWhatsappTemplateDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappTemplateResponse> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const type = this.inferTypeFromStepCount(dto.steps.length);
    this.validateSteps(type, dto.steps);

    const template = this.templatesRepository.create({
      organizationId: resolvedOrganizationId,
      createdByUserId: user.id,
      name: dto.name.trim(),
      description: dto.description?.trim() ?? null,
      type,
      visibility: dto.visibility ?? 'private',
      isActive: dto.isActive ?? true,
      steps: this.buildStepEntities(dto.steps),
    });

    const saved = await this.templatesRepository.save(template);
    return this.templateMapper.toResponse(saved);
  }

  async update(
    id: string,
    dto: UpdateWhatsappTemplateDto,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappTemplateResponse> {
    const template = await this.requireManageableTemplate(
      id,
      organizationId,
      user,
    );

    if (dto.name !== undefined) {
      template.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      template.description = dto.description.trim() || null;
    }

    if (dto.visibility !== undefined) {
      template.visibility = dto.visibility;
    }

    if (dto.isActive !== undefined) {
      template.isActive = dto.isActive;
    }

    if (dto.steps !== undefined) {
      template.type = this.inferTypeFromStepCount(dto.steps.length);
      this.validateSteps(template.type, dto.steps);
      template.steps = this.buildStepEntities(dto.steps);
    }

    const saved = await this.templatesRepository.save(template);
    return this.templateMapper.toResponse(saved);
  }

  async remove(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<void> {
    const template = await this.requireManageableTemplate(
      id,
      organizationId,
      user,
    );
    await this.templatesRepository.remove(template);
  }

  private async requireVisibleTemplate(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappTemplateEntity> {
    const resolvedOrganizationId = requireOrganizationId(organizationId);
    const template = await this.templatesRepository.findByIdAndOrganizationId(
      id,
      resolvedOrganizationId,
    );

    if (!template) {
      throw new NotFoundException('WhatsApp template not found');
    }

    const isVisible =
      template.visibility === 'org' || template.createdByUserId === user.id;

    if (!isVisible) {
      throw new NotFoundException('WhatsApp template not found');
    }

    return template;
  }

  private async requireManageableTemplate(
    id: string,
    organizationId: string | null,
    user: AuthUser,
  ): Promise<WhatsappTemplateEntity> {
    const template = await this.requireVisibleTemplate(
      id,
      organizationId,
      user,
    );

    const canManageOrgTemplate =
      template.visibility === 'org' &&
      hasPermission(user, 'whatsapp-templates:manage');
    const canManageOwnTemplate =
      template.createdByUserId === user.id &&
      hasPermission(user, 'whatsapp-templates:manage');

    if (!canManageOrgTemplate && !canManageOwnTemplate) {
      throw new ForbiddenException('You cannot modify this WhatsApp template');
    }

    return template;
  }

  private inferTypeFromStepCount(stepCount: number): WhatsappTemplateType {
    return stepCount <= 1 ? 'single' : 'sequence';
  }

  private validateSteps(
    type: WhatsappTemplateType,
    steps: CreateWhatsappTemplateStepDto[],
  ): void {
    const normalized = steps.map((step) => ({
      stepOrder: step.stepOrder,
      body: step.body,
      delayDays: step.delayDays ?? (step.stepOrder === 1 ? 0 : 1),
      delayMode: step.delayMode,
      scheduledDate: step.scheduledDate,
    }));

    if (type === 'single' && normalized.length !== 1) {
      throw new BadRequestException(
        'Single WhatsApp templates must contain exactly one step',
      );
    }

    validateWhatsappCampaignSteps(normalized);
  }

  private buildStepEntities(
    steps: CreateWhatsappTemplateStepDto[],
  ): WhatsappTemplateStepEntity[] {
    const normalized = steps.map((step) => ({
      stepOrder: step.stepOrder,
      body: step.body,
      delayDays: step.delayDays ?? (step.stepOrder === 1 ? 0 : 1),
      delayMode: step.delayMode,
      scheduledDate: step.scheduledDate,
    }));

    return buildWhatsappSequenceStepEntities(normalized, 'template').map(
      (partial) => {
        const entity = new WhatsappTemplateStepEntity();
        entity.stepOrder = partial.stepOrder;
        entity.body = partial.body;
        entity.delayMode = partial.delayMode;
        entity.delayDays = partial.delayDays;
        entity.scheduledDate = partial.scheduledDate;
        return entity;
      },
    );
  }
}
