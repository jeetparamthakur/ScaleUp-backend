import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository, SelectQueryBuilder } from 'typeorm';
import { ProspectEngagementEntity } from './entities/prospect-engagement.entity';
import { ProspectFieldSchemaEntity } from './entities/prospect-field-schema.entity';
import { ProspectEntity } from './entities/prospect.entity';
import { DEFAULT_PROSPECT_FIELD_SCHEMA } from './types/prospect-field-schema';
import {
  PIPELINE_STAGE_FIELD_KEY,
  PROTECTED_PIPELINE_STAGE_VALUE,
} from './types/prospect-field-schema';

export interface ProspectsQuery {
  q?: string;
  page: number;
  pageSize: number;
  filters?: Record<string, string>;
  multiselectFieldKeys?: string[];
  pipelineStageFieldKey?: string;
  followUpRange?: FollowUpRange;
  followUpFieldKey?: string;
}

export interface PaginatedProspects {
  items: ProspectEntity[];
  total: number;
  page: number;
  pageSize: number;
}

export type FollowUpRange = 'overdue' | 'today' | 'week' | 'month' | 'all';

export interface FollowUpsQuery {
  range: FollowUpRange;
  page: number;
  pageSize: number;
  fieldKey: string;
}

function followUpDueExpr(fieldKey: string): string {
  return `(prospect.values ->> '${fieldKey}')::date`;
}

function applyFollowUpRangeFilter(
  qb: SelectQueryBuilder<ProspectEntity>,
  fieldKey: string,
  range: FollowUpRange,
): void {
  const followUpExpr = followUpDueExpr(fieldKey);

  qb.andWhere('prospect.values ->> :followUpFieldKey IS NOT NULL')
    .andWhere("prospect.values ->> :followUpFieldKey != ''")
    .setParameter('followUpFieldKey', fieldKey);

  switch (range) {
    case 'overdue':
      qb.andWhere(`${followUpExpr} < CURRENT_DATE`);
      break;
    case 'today':
      qb.andWhere(`${followUpExpr} = CURRENT_DATE`);
      break;
    case 'week':
      qb.andWhere(`${followUpExpr} >= date_trunc('week', CURRENT_DATE)::date`);
      qb.andWhere(
        `${followUpExpr} <= (date_trunc('week', CURRENT_DATE)::date + interval '6 days')::date`,
      );
      break;
    case 'month':
      qb.andWhere(`${followUpExpr} >= date_trunc('month', CURRENT_DATE)::date`);
      qb.andWhere(
        `${followUpExpr} <= (date_trunc('month', CURRENT_DATE)::date + interval '1 month - 1 day')::date`,
      );
      break;
    case 'all':
      break;
  }
}

@Injectable()
export class ProspectsRepository {
  constructor(
    @InjectRepository(ProspectFieldSchemaEntity)
    private readonly schemaRepository: Repository<ProspectFieldSchemaEntity>,
    @InjectRepository(ProspectEntity)
    private readonly prospectRepository: Repository<ProspectEntity>,
    @InjectRepository(ProspectEngagementEntity)
    private readonly engagementRepository: Repository<ProspectEngagementEntity>,
  ) {}

  findSchemaByOrganizationId(
    organizationId: string,
  ): Promise<ProspectFieldSchemaEntity | null> {
    return this.schemaRepository.findOne({ where: { organizationId } });
  }

  createSchema(organizationId: string): Promise<ProspectFieldSchemaEntity> {
    const schema = this.schemaRepository.create({
      organizationId,
      fields: DEFAULT_PROSPECT_FIELD_SCHEMA.fields,
    });

    return this.schemaRepository.save(schema);
  }

  saveSchema(
    schema: ProspectFieldSchemaEntity,
  ): Promise<ProspectFieldSchemaEntity> {
    return this.schemaRepository.save(schema);
  }

  findProspectById(
    id: string,
    organizationId: string,
  ): Promise<ProspectEntity | null> {
    return this.prospectRepository.findOne({ where: { id, organizationId } });
  }

  findByIdsForOrganization(
    organizationId: string,
    ids: string[],
  ): Promise<ProspectEntity[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    return this.prospectRepository.find({
      where: { organizationId, id: In(ids) },
    });
  }

  createProspect(data: Partial<ProspectEntity>): ProspectEntity {
    return this.prospectRepository.create(data);
  }

  saveProspect(prospect: ProspectEntity): Promise<ProspectEntity> {
    return this.prospectRepository.save(prospect);
  }

  saveProspects(prospects: ProspectEntity[]): Promise<ProspectEntity[]> {
    if (prospects.length === 0) {
      return Promise.resolve([]);
    }

    return this.prospectRepository.save(prospects);
  }

  async findExistingEmailsByOrganization(
    organizationId: string,
    emails: string[],
  ): Promise<Set<string>> {
    const normalizedEmails = Array.from(
      new Set(
        emails
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0),
      ),
    );

    if (normalizedEmails.length === 0) {
      return new Set();
    }

    const matches = await this.prospectRepository
      .createQueryBuilder('prospect')
      .select('LOWER(prospect.email)', 'email')
      .where('prospect.organizationId = :organizationId', { organizationId })
      .andWhere('LOWER(prospect.email) IN (:...emails)', {
        emails: normalizedEmails,
      })
      .getRawMany<{ email: string }>();

    return new Set(matches.map((match) => match.email));
  }

  async deleteProspect(id: string, organizationId: string): Promise<boolean> {
    const result = await this.prospectRepository.delete({ id, organizationId });
    return (result.affected ?? 0) > 0;
  }

  async findPaginated(
    organizationId: string,
    query: ProspectsQuery,
  ): Promise<PaginatedProspects> {
    const qb = this.prospectRepository
      .createQueryBuilder('prospect')
      .where('prospect.organizationId = :organizationId', { organizationId });

    if (query.q?.trim()) {
      const search = `%${query.q.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(prospect.fullName) LIKE :search', { search })
            .orWhere('LOWER(prospect.email) LIKE :search', { search })
            .orWhere("LOWER(prospect.values ->> 'designation') LIKE :search", {
              search,
            });
        }),
      );
    }

    if (query.filters) {
      const multiselectKeys = new Set(query.multiselectFieldKeys ?? []);

      for (const [key, value] of Object.entries(query.filters)) {
        if (!value) {
          continue;
        }

        const paramName = `filter_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const pipelineStageKey =
          query.pipelineStageFieldKey ?? PIPELINE_STAGE_FIELD_KEY;

        if (
          key === pipelineStageKey &&
          value === PROTECTED_PIPELINE_STAGE_VALUE
        ) {
          qb.andWhere(
            new Brackets((where) => {
              where
                .where(
                  `prospect.values ->> :${paramName}Key = :${paramName}Value`,
                  {
                    [`${paramName}Key`]: key,
                    [`${paramName}Value`]: value,
                  },
                )
                .orWhere(`prospect.values ->> :${paramName}Key IS NULL`, {
                  [`${paramName}Key`]: key,
                })
                .orWhere(`prospect.values ->> :${paramName}Key = ''`, {
                  [`${paramName}Key`]: key,
                });
            }),
          );
          continue;
        }

        if (multiselectKeys.has(key)) {
          qb.andWhere(
            new Brackets((where) => {
              where
                .where(
                  `prospect.values -> :${paramName}Key ? :${paramName}Value`,
                  {
                    [`${paramName}Key`]: key,
                    [`${paramName}Value`]: value,
                  },
                )
                .orWhere(
                  `prospect.values ->> :${paramName}Key = :${paramName}Value`,
                  {
                    [`${paramName}Key`]: key,
                    [`${paramName}Value`]: value,
                  },
                );
            }),
          );
          continue;
        }

        qb.andWhere(
          `prospect.values ->> :${paramName}Key = :${paramName}Value`,
          {
            [`${paramName}Key`]: key,
            [`${paramName}Value`]: value,
          },
        );
      }
    }

    if (query.followUpRange && query.followUpFieldKey) {
      applyFollowUpRangeFilter(qb, query.followUpFieldKey, query.followUpRange);
    }

    qb.orderBy('prospect.createdAt', 'DESC');

    const total = await qb.getCount();
    const items = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getMany();

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async findFollowUpsPaginated(
    organizationId: string,
    query: FollowUpsQuery,
  ): Promise<PaginatedProspects> {
    const followUpExpr = followUpDueExpr(query.fieldKey);

    const qb = this.prospectRepository
      .createQueryBuilder('prospect')
      .where('prospect.organizationId = :organizationId', { organizationId });

    applyFollowUpRangeFilter(qb, query.fieldKey, query.range);

    qb.orderBy(followUpExpr, 'ASC');

    const total = await qb.getCount();
    const items = await qb
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize)
      .getMany();

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  searchProspects(
    organizationId: string,
    q: string,
    limit: number,
  ): Promise<ProspectEntity[]> {
    const search = `%${q.trim().toLowerCase()}%`;

    return this.prospectRepository
      .createQueryBuilder('prospect')
      .where('prospect.organizationId = :organizationId', { organizationId })
      .andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(prospect.fullName) LIKE :search', { search })
            .orWhere('LOWER(prospect.email) LIKE :search', { search });
        }),
      )
      .orderBy('prospect.fullName', 'ASC')
      .take(limit)
      .getMany();
  }

  createEngagement(
    data: Partial<ProspectEngagementEntity>,
  ): ProspectEngagementEntity {
    return this.engagementRepository.create(data);
  }

  saveEngagement(
    engagement: ProspectEngagementEntity,
  ): Promise<ProspectEngagementEntity> {
    return this.engagementRepository.save(engagement);
  }

  findEngagementsByProspectId(
    prospectId: string,
  ): Promise<ProspectEngagementEntity[]> {
    return this.engagementRepository
      .createQueryBuilder('engagement')
      .leftJoinAndSelect('engagement.createdBy', 'createdBy')
      .where('engagement.prospectId = :prospectId', { prospectId })
      .orderBy('engagement.createdAt', 'DESC')
      .getMany();
  }

  findEngagementById(id: string): Promise<ProspectEngagementEntity | null> {
    return this.engagementRepository
      .createQueryBuilder('engagement')
      .leftJoinAndSelect('engagement.createdBy', 'createdBy')
      .where('engagement.id = :id', { id })
      .getOne();
  }

  async removeValuesForDeletedFields(
    organizationId: string,
    deletedKeys: string[],
  ): Promise<void> {
    if (deletedKeys.length === 0) {
      return;
    }

    const prospects = await this.prospectRepository.find({
      where: { organizationId },
    });

    const updatedProspects = prospects
      .map((prospect) => {
        let changed = false;
        const nextValues = { ...prospect.values };

        for (const key of deletedKeys) {
          if (key in nextValues) {
            delete nextValues[key];
            changed = true;
          }
        }

        if (!changed) {
          return null;
        }

        prospect.values = nextValues;
        return prospect;
      })
      .filter((prospect): prospect is ProspectEntity => prospect !== null);

    if (updatedProspects.length > 0) {
      await this.prospectRepository.save(updatedProspects);
    }
  }

  async findFieldKeysInUse(organizationId: string): Promise<string[]> {
    const keys = new Set<string>();

    const hasFullName = await this.prospectRepository
      .createQueryBuilder('prospect')
      .where('prospect.organizationId = :organizationId', { organizationId })
      .andWhere("nullif(trim(prospect.fullName), '') IS NOT NULL")
      .limit(1)
      .getCount();

    if (hasFullName > 0) {
      keys.add('fullName');
    }

    const hasEmail = await this.prospectRepository
      .createQueryBuilder('prospect')
      .where('prospect.organizationId = :organizationId', { organizationId })
      .andWhere("nullif(trim(prospect.email), '') IS NOT NULL")
      .limit(1)
      .getCount();

    if (hasEmail > 0) {
      keys.add('email');
    }

    const jsonRows = await this.prospectRepository.manager.query<
      { key: string }[]
    >(
      `SELECT DISTINCT kv.key AS key
       FROM prospects p
       CROSS JOIN LATERAL jsonb_each(p.values) AS kv(key, value)
       WHERE p.organization_id = $1
         AND (
           (jsonb_typeof(kv.value) = 'string' AND nullif(trim(kv.value #>> '{}'), '') IS NOT NULL)
           OR jsonb_typeof(kv.value) = 'number'
           OR (
             jsonb_typeof(kv.value) = 'object'
             AND EXISTS (
               SELECT 1
               FROM jsonb_each_text(kv.value) AS loc(loc_key, loc_value)
               WHERE nullif(trim(loc_value), '') IS NOT NULL
             )
           )
         )`,
      [organizationId],
    );

    for (const row of jsonRows) {
      keys.add(row.key);
    }

    return [...keys];
  }

  countProspectsByFieldValue(
    organizationId: string,
    fieldKey: string,
    fieldValue: string,
  ): Promise<number> {
    return this.prospectRepository
      .createQueryBuilder('prospect')
      .where('prospect.organizationId = :organizationId', { organizationId })
      .andWhere('prospect.values ->> :fieldKey = :fieldValue', {
        fieldKey,
        fieldValue,
      })
      .getCount();
  }

  countProspectsGroupedByFieldValue(
    organizationId: string,
    fieldKey: string,
    options?: {
      followUpRange?: FollowUpRange;
      followUpFieldKey?: string;
    },
  ): Promise<Array<{ value: string | null; count: number }>> {
    const qb = this.prospectRepository
      .createQueryBuilder('prospect')
      .select(`prospect.values ->> :fieldKey`, 'value')
      .addSelect('COUNT(*)', 'count')
      .where('prospect.organizationId = :organizationId', { organizationId })
      .setParameter('fieldKey', fieldKey);

    if (options?.followUpRange && options.followUpFieldKey) {
      applyFollowUpRangeFilter(
        qb,
        options.followUpFieldKey,
        options.followUpRange,
      );
    }

    return qb
      .groupBy(`prospect.values ->> :fieldKey`)
      .getRawMany<{ value: string | null; count: string }>()
      .then((rows) =>
        rows.map((row) => ({
          value: row.value,
          count: Number(row.count),
        })),
      );
  }
}
