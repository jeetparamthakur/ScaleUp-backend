import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { WhatsappContactListMemberEntity } from '../whatsapp-contact-lists/entities/whatsapp-contact-list-member.entity';
import { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import type { WhatsappCampaignRecipientStatus } from './entities/whatsapp-campaign-recipient.entity';

export interface WhatsappCampaignRecipientsListQuery {
  search?: string;
  status?: WhatsappCampaignRecipientStatus;
  page: number;
  limit: number;
}

export interface PaginatedWhatsappCampaignRecipients {
  items: WhatsappCampaignRecipientEntity[];
  total: number;
  page: number;
  limit: number;
}

const REPLY_ELIGIBLE_CAMPAIGN_STATUSES = [
  'scheduled',
  'sending',
  'completed',
  'stopped',
] as const;

/** PostgreSQL POSIX regex: strip non-digits (\\D is not valid in PG). */
const PHONE_DIGITS_SQL =
  "regexp_replace(recipient.phone_e164, '[^0-9]', '', 'g')";

const NATIONAL_SIGNIFICANT_LENGTH = 10;

@Injectable()
export class WhatsappCampaignRecipientsRepository {
  constructor(
    @InjectRepository(WhatsappCampaignRecipientEntity)
    private readonly repository: Repository<WhatsappCampaignRecipientEntity>,
  ) {}

  saveMany(
    rows: WhatsappCampaignRecipientEntity[],
  ): Promise<WhatsappCampaignRecipientEntity[]> {
    return this.repository.save(rows);
  }

  findNextDue(
    campaignId: string,
    limit: number,
    now: Date,
  ): Promise<WhatsappCampaignRecipientEntity[]> {
    return this.repository
      .createQueryBuilder('recipient')
      .where('recipient.campaign_id = :campaignId', { campaignId })
      .andWhere('recipient.status = :status', { status: 'pending' })
      .andWhere(
        '(recipient.next_send_at IS NULL OR recipient.next_send_at <= :now)',
        { now },
      )
      .orderBy('COALESCE(recipient.next_send_at, recipient.created_at)', 'ASC')
      .take(limit)
      .getMany();
  }

  countByCampaignAndStatus(
    campaignId: string,
    status: WhatsappCampaignRecipientEntity['status'],
  ): Promise<number> {
    return this.repository.count({ where: { campaignId, status } });
  }

  save(
    entity: WhatsappCampaignRecipientEntity,
  ): Promise<WhatsappCampaignRecipientEntity> {
    return this.repository.save(entity);
  }

  async findPhonesAlreadyOnCampaign(
    campaignId: string,
    phoneE164List: string[],
  ): Promise<Set<string>> {
    if (phoneE164List.length === 0) {
      return new Set();
    }

    const digitsList = [
      ...new Set(phoneE164List.map((phone) => phone.replace(/\D/g, ''))),
    ].filter((digits) => digits.length > 0);

    if (digitsList.length === 0) {
      return new Set();
    }

    const rows = await this.repository
      .createQueryBuilder('recipient')
      .select('recipient.phone_e164', 'phoneE164')
      .where('recipient.campaign_id = :campaignId', { campaignId })
      .andWhere(
        `regexp_replace(recipient.phone_e164, '[^0-9]', '', 'g') IN (:...digitsList)`,
        { digitsList },
      )
      .getRawMany<{ phoneE164: string }>();

    return new Set(rows.map((row) => row.phoneE164));
  }

  async countBySenderForCampaign(
    campaignId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.repository
      .createQueryBuilder('recipient')
      .select('recipient.sender_connection_id', 'senderConnectionId')
      .addSelect('COUNT(*)', 'count')
      .where('recipient.campaign_id = :campaignId', { campaignId })
      .andWhere('recipient.sender_connection_id IS NOT NULL')
      .groupBy('recipient.sender_connection_id')
      .getRawMany<{ senderConnectionId: string; count: string }>();

    const map = new Map<string, number>();
    for (const row of rows) {
      map.set(row.senderConnectionId, Number.parseInt(row.count, 10));
    }

    return map;
  }

  async listAddableMembersForCampaign(
    organizationId: string,
    campaignId: string,
    contactListId: string,
    query: { search?: string; page: number; limit: number },
  ): Promise<{
    items: WhatsappContactListMemberEntity[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qb = this.repository.manager
      .getRepository(WhatsappContactListMemberEntity)
      .createQueryBuilder('member')
      .where('member.organizationId = :organizationId', { organizationId })
      .andWhere('member.listId = :contactListId', { contactListId })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM whatsapp_campaign_recipients recipient
          WHERE recipient.campaign_id = :campaignId
            AND regexp_replace(recipient.phone_e164, '[^0-9]', '', 'g')
              = regexp_replace(member.phone, '[^0-9]', '', 'g')
        )`,
        { campaignId },
      );

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(member.phone) LIKE :search', { search })
            .orWhere('LOWER(member.firstName) LIKE :search', { search })
            .orWhere('LOWER(member.lastName) LIKE :search', { search })
            .orWhere('LOWER(member.company) LIKE :search', { search });
        }),
      );
    }

    const total = await qb.getCount();
    const items = await qb
      .orderBy('member.createdAt', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  findById(id: string): Promise<WhatsappCampaignRecipientEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findMostRecentSentForReply(
    senderConnectionId: string,
    phoneDigits: string,
  ): Promise<WhatsappCampaignRecipientEntity | null> {
    const byRecipientSender = await this.buildReplyLookupQuery(
      senderConnectionId,
      phoneDigits,
      true,
    ).getOne();

    if (byRecipientSender) {
      return byRecipientSender;
    }

    return this.buildReplyLookupQuery(
      senderConnectionId,
      phoneDigits,
      false,
    ).getOne();
  }

  findSentForReplySync(
    limit: number,
  ): Promise<WhatsappCampaignRecipientEntity[]> {
    return this.repository
      .createQueryBuilder('recipient')
      .innerJoin('recipient.campaign', 'campaign')
      .where('recipient.status IN (:...statuses)', {
        statuses: ['sent', 'pending'],
      })
      .andWhere('recipient.sent_at IS NOT NULL')
      .andWhere('recipient.sender_connection_id IS NOT NULL')
      .andWhere('campaign.status IN (:...campaignStatuses)', {
        campaignStatuses: [...REPLY_ELIGIBLE_CAMPAIGN_STATUSES],
      })
      .orderBy('recipient.sent_at', 'DESC')
      .take(limit)
      .getMany();
  }

  private buildReplyLookupQuery(
    senderConnectionId: string,
    phoneDigits: string,
    matchRecipientSenderColumn: boolean,
  ) {
    const qb = this.repository
      .createQueryBuilder('recipient')
      .innerJoin('recipient.campaign', 'campaign')
      .andWhere(
        `(
          ${PHONE_DIGITS_SQL} = :phoneDigits
          OR (
            length(${PHONE_DIGITS_SQL}) >= :minNationalLen
            AND length(:phoneDigits) >= :minNationalLen
            AND right(${PHONE_DIGITS_SQL}, :minNationalLen) =
              right(:phoneDigits, :minNationalLen)
          )
        )`,
        {
          phoneDigits,
          minNationalLen: NATIONAL_SIGNIFICANT_LENGTH,
        },
      )
      .andWhere('recipient.status IN (:...statuses)', {
        statuses: ['sent', 'pending'],
      })
      .andWhere('recipient.sent_at IS NOT NULL')
      .andWhere('campaign.status IN (:...campaignStatuses)', {
        campaignStatuses: [...REPLY_ELIGIBLE_CAMPAIGN_STATUSES],
      });

    if (matchRecipientSenderColumn) {
      qb.andWhere('recipient.sender_connection_id = :senderConnectionId', {
        senderConnectionId,
      });
    } else {
      qb.innerJoin(
        'whatsapp_campaign_senders',
        'campaign_sender',
        'campaign_sender.campaign_id = campaign.id AND campaign_sender.sender_connection_id = :senderConnectionId',
        { senderConnectionId },
      );
    }

    return qb.orderBy('recipient.sent_at', 'DESC');
  }

  async listByCampaign(
    organizationId: string,
    campaignId: string,
    query: WhatsappCampaignRecipientsListQuery,
  ): Promise<PaginatedWhatsappCampaignRecipients> {
    const qb = this.buildCampaignRecipientQuery(
      organizationId,
      campaignId,
      query,
    );

    const total = await qb.getCount();
    const items = await qb
      .orderBy('recipient.created_at', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async listRepliesByCampaign(
    organizationId: string,
    campaignId: string,
    query: Omit<WhatsappCampaignRecipientsListQuery, 'status'>,
  ): Promise<PaginatedWhatsappCampaignRecipients> {
    const qb = this.buildCampaignRecipientQuery(organizationId, campaignId, {
      ...query,
      status: 'replied',
    });

    const total = await qb.getCount();
    const items = await qb
      .orderBy('recipient.replied_at', 'DESC', 'NULLS LAST')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getMany();

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  private buildCampaignRecipientQuery(
    organizationId: string,
    campaignId: string,
    query: WhatsappCampaignRecipientsListQuery,
  ) {
    const qb = this.repository
      .createQueryBuilder('recipient')
      .where('recipient.organization_id = :organizationId', {
        organizationId,
      })
      .andWhere('recipient.campaign_id = :campaignId', { campaignId });

    if (query.status) {
      qb.andWhere('recipient.status = :status', { status: query.status });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.leftJoin(
        WhatsappContactListMemberEntity,
        'member',
        'member.id = recipient.list_member_id',
      ).andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(recipient.phone_e164) LIKE :search', { search })
            .orWhere('LOWER(member.first_name) LIKE :search', { search })
            .orWhere('LOWER(member.last_name) LIKE :search', { search })
            .orWhere('LOWER(member.company) LIKE :search', { search });
        }),
      );
    }

    return qb;
  }
}
