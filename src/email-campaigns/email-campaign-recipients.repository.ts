import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { EmailCampaignRecipientEntity } from './entities/email-campaign-recipient.entity';
import type { EmailInboxReplyRow } from './mappers/email-inbox.mapper';
import { applyManualPauseResume } from './campaign-recipient-action.util';
import { applyInboxReplyListOrdering } from './inbox-reply-query.util';

@Injectable()
export class EmailCampaignRecipientsRepository {
  constructor(
    @InjectRepository(EmailCampaignRecipientEntity)
    private readonly repository: Repository<EmailCampaignRecipientEntity>,
  ) {}

  findByCampaignId(
    campaignId: string,
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository.find({
      where: { campaignId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByCampaignIdWithSearch(
    campaignId: string,
    search?: string,
  ): Promise<EmailCampaignRecipientEntity[]> {
    const qb = this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId });

    if (search?.trim()) {
      qb.andWhere('LOWER(recipient.email) LIKE :search', {
        search: `%${search.trim().toLowerCase()}%`,
      });
    }

    return qb.orderBy('recipient.createdAt', 'ASC').getMany();
  }

  async deleteByCampaignId(campaignId: string): Promise<void> {
    await this.repository.delete({ campaignId });
  }

  async insertMany(recipients: EmailCampaignRecipientEntity[]): Promise<void> {
    if (recipients.length === 0) {
      return;
    }

    await this.repository.insert(recipients);
  }

  save(
    entity: EmailCampaignRecipientEntity,
  ): Promise<EmailCampaignRecipientEntity> {
    return this.repository.save(entity);
  }

  saveMany(
    entities: EmailCampaignRecipientEntity[],
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository.save(entities);
  }

  countByCampaignId(campaignId: string): Promise<number> {
    return this.repository.count({ where: { campaignId } });
  }

  countCompletedByCampaignId(campaignId: string): Promise<number> {
    return this.repository.count({
      where: { campaignId, status: 'completed' },
    });
  }

  countIncompleteByCampaignId(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.status IN (:...statuses)', {
        statuses: ['pending', 'active'],
      })
      .andWhere('recipient.contactDisposition = :disposition', {
        disposition: 'eligible',
      })
      .getCount();
  }

  findByIdAndCampaignId(
    recipientId: string,
    campaignId: string,
  ): Promise<EmailCampaignRecipientEntity | null> {
    return this.repository.findOne({
      where: { id: recipientId, campaignId },
    });
  }

  findByCampaignIdAndEmail(
    campaignId: string,
    email: string,
  ): Promise<EmailCampaignRecipientEntity | null> {
    return this.repository.findOne({
      where: { campaignId, email: email.toLowerCase() },
    });
  }

  findFollowUpEligibleWithNextSendAt(
    campaignId: string,
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.status IN (:...statuses)', {
        statuses: ['pending', 'active'],
      })
      .andWhere('recipient.currentStepOrder > :firstStep', { firstStep: 1 })
      .andWhere('recipient.contactDisposition = :disposition', {
        disposition: 'eligible',
      })
      .andWhere('recipient.nextSendAt IS NOT NULL')
      .orderBy('recipient.lastSentAt', 'ASC', 'NULLS LAST')
      .addOrderBy('recipient.createdAt', 'ASC')
      .getMany();
  }

  findFollowUpEligibleOnStepAndSendDate(
    campaignId: string,
    stepOrder: number,
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.status IN (:...statuses)', {
        statuses: ['pending', 'active'],
      })
      .andWhere('recipient.currentStepOrder = :stepOrder', { stepOrder })
      .andWhere('recipient.contactDisposition = :disposition', {
        disposition: 'eligible',
      })
      .andWhere('recipient.nextSendAt IS NOT NULL')
      .orderBy('recipient.lastSentAt', 'ASC', 'NULLS LAST')
      .addOrderBy('recipient.createdAt', 'ASC')
      .getMany();
  }

  findStepOnePendingWithoutSchedule(
    campaignId: string,
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.status = :status', { status: 'pending' })
      .andWhere('recipient.currentStepOrder = :stepOrder', { stepOrder: 1 })
      .andWhere('recipient.contactDisposition = :disposition', {
        disposition: 'eligible',
      })
      .andWhere('recipient.nextSendAt IS NULL')
      .orderBy('recipient.createdAt', 'ASC')
      .getMany();
  }

  findReadyToSend(
    campaignId: string,
    limit: number,
    now: Date,
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.status IN (:...statuses)', {
        statuses: ['pending', 'active'],
      })
      .andWhere('recipient.contactDisposition = :disposition', {
        disposition: 'eligible',
      })
      .andWhere('recipient.replyCategory IS NULL')
      .andWhere(
        '(recipient.repliedAt IS NULL OR recipient.allowSendDespiteReply = :allowSendDespiteReply)',
        { allowSendDespiteReply: true },
      )
      .andWhere(
        '(recipient.nextSendAt IS NULL OR recipient.nextSendAt <= :now)',
        { now },
      )
      .orderBy('recipient.nextSendAt', 'ASC', 'NULLS LAST')
      .addOrderBy('recipient.createdAt', 'ASC')
      .take(limit)
      .getMany();
  }

  countWithLastSentAt(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.lastSentAt IS NOT NULL')
      .getCount();
  }

  countByMaxStepSentAtLeast(
    campaignId: string,
    stepOrder: number,
  ): Promise<number> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.lastSentAt IS NOT NULL')
      .andWhere(
        `(
          (recipient.status = :completed AND recipient.currentStepOrder >= :stepOrder)
          OR (recipient.status != :completed AND recipient.currentStepOrder > :stepOrder)
        )`,
        { completed: 'completed', stepOrder },
      )
      .getCount();
  }

  countNoReplyYet(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.lastSentAt IS NOT NULL')
      .andWhere('recipient.replyCategory IS NULL')
      .andWhere('recipient.repliedAt IS NULL')
      .getCount();
  }

  countByReplyCategory(campaignId: string, category: string): Promise<number> {
    return this.repository.count({
      where: { campaignId, replyCategory: category as never },
    });
  }

  countByDisposition(campaignId: string, disposition: string): Promise<number> {
    return this.repository.count({
      where: { campaignId, contactDisposition: disposition as never },
    });
  }

  countEligibleNotContacted(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere('recipient.contactDisposition = :disposition', {
        disposition: 'eligible',
      })
      .andWhere('recipient.lastSentAt IS NULL')
      .getCount();
  }

  countRepliedByCampaignId(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId = :campaignId', { campaignId })
      .andWhere(
        '(recipient.replyCategory IS NOT NULL OR recipient.repliedAt IS NOT NULL)',
      )
      .getCount();
  }

  countSentByCampaignIds(campaignIds: string[]): Promise<number> {
    if (campaignIds.length === 0) {
      return Promise.resolve(0);
    }

    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId IN (:...campaignIds)', { campaignIds })
      .andWhere('recipient.lastSentAt IS NOT NULL')
      .getCount();
  }

  countRepliedByCampaignIds(campaignIds: string[]): Promise<number> {
    if (campaignIds.length === 0) {
      return Promise.resolve(0);
    }

    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaignId IN (:...campaignIds)', { campaignIds })
      .andWhere(
        '(recipient.replyCategory IS NOT NULL OR recipient.repliedAt IS NOT NULL)',
      )
      .getCount();
  }

  countDistinctSentEmailsByCampaignIds(campaignIds: string[]): Promise<number> {
    if (campaignIds.length === 0) {
      return Promise.resolve(0);
    }

    return this.repository
      .createQueryBuilder('recipient')
      .select('COUNT(DISTINCT recipient.email)', 'count')
      .where('recipient.campaignId IN (:...campaignIds)', { campaignIds })
      .andWhere('recipient.lastSentAt IS NOT NULL')
      .getRawOne<{ count: string }>()
      .then((result) => Number(result?.count ?? 0));
  }

  findEngagementByCampaignIdsAndEmails(
    campaignIds: string[],
    emails: string[],
  ): Promise<
    Array<{
      email: string;
      lastSentAt: Date | null;
      replyCategory: string | null;
      repliedAt: Date | null;
      status: string;
    }>
  > {
    if (campaignIds.length === 0 || emails.length === 0) {
      return Promise.resolve([]);
    }

    return this.repository
      .createQueryBuilder('recipient')
      .select([
        'recipient.email AS email',
        'recipient.lastSentAt AS "lastSentAt"',
        'recipient.replyCategory AS "replyCategory"',
        'recipient.repliedAt AS "repliedAt"',
        'recipient.status AS status',
      ])
      .where('recipient.campaignId IN (:...campaignIds)', { campaignIds })
      .andWhere('recipient.email IN (:...emails)', { emails })
      .getRawMany();
  }

  findPage(
    skip: number,
    take: number,
  ): Promise<EmailCampaignRecipientEntity[]> {
    return this.repository.find({
      order: { createdAt: 'ASC' },
      skip,
      take,
    });
  }

  async findRepliesByOrganizationId(input: {
    organizationId: string;
    campaignId?: string;
    replyCategory?: string;
    search?: string;
    page: number;
    limit: number;
  }): Promise<{ items: EmailInboxReplyRow[]; total: number }> {
    const qb = this.repository
      .createQueryBuilder('recipient')
      .innerJoinAndSelect('recipient.campaign', 'campaign')
      .where('campaign.organizationId = :organizationId', {
        organizationId: input.organizationId,
      })
      .andWhere(
        '(recipient.repliedAt IS NOT NULL OR recipient.replyCategory IS NOT NULL)',
      );

    if (input.campaignId) {
      qb.andWhere('recipient.campaignId = :campaignId', {
        campaignId: input.campaignId,
      });
    }

    if (input.replyCategory) {
      qb.andWhere('recipient.replyCategory = :replyCategory', {
        replyCategory: input.replyCategory,
      });
    }

    const search = input.search?.trim().toLowerCase();

    if (search) {
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(recipient.email) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere('LOWER(recipient.replySubject) LIKE :search', {
              search: `%${search}%`,
            })
            .orWhere(
              'LOWER(CAST(recipient.mergeFields AS text)) LIKE :search',
              {
                search: `%${search}%`,
              },
            )
            .orWhere('LOWER(campaign.name) LIKE :search', {
              search: `%${search}%`,
            });
        }),
      );
    }

    const total = await qb.clone().getCount();

    const entities = await applyInboxReplyListOrdering(qb)
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getMany();

    return {
      items: entities.map((recipient) => ({
        recipient,
        campaignName: recipient.campaign.name,
      })),
      total,
    };
  }

  async findReplyByIdAndOrganizationId(
    recipientId: string,
    organizationId: string,
  ): Promise<EmailInboxReplyRow | null> {
    const recipient = await this.repository
      .createQueryBuilder('recipient')
      .innerJoinAndSelect('recipient.campaign', 'campaign')
      .where('recipient.id = :recipientId', { recipientId })
      .andWhere('campaign.organizationId = :organizationId', {
        organizationId,
      })
      .andWhere(
        '(recipient.repliedAt IS NOT NULL OR recipient.replyCategory IS NOT NULL)',
      )
      .getOne();

    if (!recipient) {
      return null;
    }

    return {
      recipient,
      campaignName: recipient.campaign.name,
    };
  }

  async markReplyAsRead(
    recipientId: string,
    organizationId: string,
    input: {
      replyCategory: EmailCampaignRecipientEntity['replyCategory'];
      reason?: string;
    },
  ): Promise<EmailCampaignRecipientEntity | null> {
    const row = await this.findReplyByIdAndOrganizationId(
      recipientId,
      organizationId,
    );

    if (!row) {
      return null;
    }

    row.recipient.replyReadAt = new Date();
    row.recipient.replyCategory = input.replyCategory;
    row.recipient.replyDoneReason = input.reason?.trim() || null;

    return this.repository.save(row.recipient);
  }

  async findAudienceByOrganizationId(input: {
    organizationId: string;
    campaignId?: string;
    disposition: 'all' | 'eligible' | 'excluded';
    search?: string;
    page: number;
    limit: number;
  }): Promise<{
    items: Array<{
      id: string;
      email: string;
      campaignId: string;
      campaignName: string;
      audienceListType: string;
      audienceListId: string;
      currentStepOrder: number;
      contactDisposition: string;
      lastSentAt: Date | null;
      mergeFields: Record<string, string>;
    }>;
    total: number;
  }> {
    const qb = this.repository
      .createQueryBuilder('recipient')
      .innerJoin('recipient.campaign', 'campaign')
      .select([
        'recipient.id AS id',
        'recipient.email AS email',
        'recipient.campaignId AS "campaignId"',
        'campaign.name AS "campaignName"',
        'campaign.audienceListType AS "audienceListType"',
        'campaign.audienceListId AS "audienceListId"',
        'recipient.currentStepOrder AS "currentStepOrder"',
        'recipient.contactDisposition AS "contactDisposition"',
        'recipient.lastSentAt AS "lastSentAt"',
        'recipient.mergeFields AS "mergeFields"',
      ])
      .where('campaign.organizationId = :organizationId', {
        organizationId: input.organizationId,
      })
      .andWhere('campaign.status != :draftStatus', { draftStatus: 'draft' })
      .andWhere('campaign.audienceListId IS NOT NULL');

    if (input.campaignId) {
      qb.andWhere('recipient.campaignId = :campaignId', {
        campaignId: input.campaignId,
      });
    }

    if (input.disposition !== 'all') {
      qb.andWhere('recipient.contactDisposition = :disposition', {
        disposition: input.disposition,
      });
    }

    const search = input.search?.trim().toLowerCase();

    if (search) {
      qb.andWhere('LOWER(recipient.email) LIKE :search', {
        search: `%${search}%`,
      });
    }

    const total = await qb.clone().getCount();

    const items = await qb
      .orderBy('recipient.createdAt', 'ASC')
      .offset((input.page - 1) * input.limit)
      .limit(input.limit)
      .getRawMany<{
        id: string;
        email: string;
        campaignId: string;
        campaignName: string;
        audienceListType: string;
        audienceListId: string;
        currentStepOrder: number;
        contactDisposition: string;
        lastSentAt: Date | null;
        mergeFields: Record<string, string>;
      }>();

    return { items, total };
  }

  async resumeExpiredPauses(now: Date): Promise<number> {
    const expired = await this.repository
      .createQueryBuilder('recipient')
      .where('recipient.contactDisposition = :disposition', {
        disposition: 'paused',
      })
      .andWhere('recipient.pausedUntil IS NOT NULL')
      .andWhere('recipient.pausedUntil <= :now', { now })
      .getMany();

    if (expired.length === 0) {
      return 0;
    }

    for (const recipient of expired) {
      applyManualPauseResume(recipient);
    }

    await this.repository.save(expired);
    return expired.length;
  }

  findByEmailAndOrganizationId(
    organizationId: string,
    email: string,
  ): Promise<EmailCampaignRecipientEntity[]> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return Promise.resolve([]);
    }

    return this.repository
      .createQueryBuilder('recipient')
      .innerJoinAndSelect('recipient.campaign', 'campaign')
      .where('campaign.organizationId = :organizationId', { organizationId })
      .andWhere('LOWER(recipient.email) = :email', { email: normalizedEmail })
      .andWhere('campaign.status != :draftStatus', { draftStatus: 'draft' })
      .orderBy('recipient.lastSentAt', 'DESC', 'NULLS LAST')
      .addOrderBy('campaign.createdAt', 'DESC')
      .getMany();
  }

  async stopActiveRecipientsByEmailInOrganization(
    organizationId: string,
    email: string,
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(EmailCampaignRecipientEntity)
      .set({
        contactDisposition: 'stopped',
        nextSendAt: null,
        pausedUntil: null,
      })
      .where(
        `campaign_id IN (
          SELECT id FROM email_campaigns WHERE organization_id = :organizationId
        )`,
        { organizationId },
      )
      .andWhere('LOWER(email) = :email', { email: email.toLowerCase() })
      .andWhere('status IN (:...statuses)', {
        statuses: ['pending', 'active'],
      })
      .execute();
  }
}
