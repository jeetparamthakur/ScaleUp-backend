import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { WhatsappTemplateEntity } from './entities/whatsapp-template.entity';
import type { WhatsappTemplateType } from './types/whatsapp-template.types';

@Injectable()
export class WhatsappTemplatesRepository {
  constructor(
    @InjectRepository(WhatsappTemplateEntity)
    private readonly repository: Repository<WhatsappTemplateEntity>,
  ) {}

  findVisibleForUser(
    organizationId: string,
    userId: string,
    options: { type?: WhatsappTemplateType; includeInactive?: boolean },
  ): Promise<WhatsappTemplateEntity[]> {
    const query = this.repository
      .createQueryBuilder('template')
      .leftJoinAndSelect('template.steps', 'step')
      .where('template.organizationId = :organizationId', { organizationId })
      .andWhere(
        new Brackets((qb) => {
          qb.where('template.visibility = :orgVisibility', {
            orgVisibility: 'org',
          }).orWhere('template.createdByUserId = :userId', { userId });
        }),
      )
      .orderBy('template.name', 'ASC')
      .addOrderBy('step.stepOrder', 'ASC');

    if (options.type) {
      query.andWhere('template.type = :type', { type: options.type });
    }

    if (!options.includeInactive) {
      query.andWhere('template.isActive = :isActive', { isActive: true });
    }

    return query.getMany();
  }

  findByIdAndOrganizationId(
    id: string,
    organizationId: string,
  ): Promise<WhatsappTemplateEntity | null> {
    return this.repository.findOne({
      where: { id, organizationId },
      relations: { steps: true },
      order: { steps: { stepOrder: 'ASC' } },
    });
  }

  create(data: Partial<WhatsappTemplateEntity>): WhatsappTemplateEntity {
    return this.repository.create(data);
  }

  save(entity: WhatsappTemplateEntity): Promise<WhatsappTemplateEntity> {
    return this.repository.save(entity);
  }

  remove(entity: WhatsappTemplateEntity): Promise<WhatsappTemplateEntity> {
    return this.repository.remove(entity);
  }
}
