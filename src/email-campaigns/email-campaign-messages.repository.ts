import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailCampaignMessageEntity } from './entities/email-campaign-message.entity';

@Injectable()
export class EmailCampaignMessagesRepository {
  constructor(
    @InjectRepository(EmailCampaignMessageEntity)
    private readonly repository: Repository<EmailCampaignMessageEntity>,
  ) {}

  save(
    entity: EmailCampaignMessageEntity,
  ): Promise<EmailCampaignMessageEntity> {
    return this.repository.save(entity);
  }

  async removePending(entity: EmailCampaignMessageEntity): Promise<void> {
    if (entity.deliveryStatus !== 'pending' || !entity.id) {
      return;
    }

    await this.repository.delete(entity.id);
  }

  findByTrackingToken(
    trackingToken: string,
  ): Promise<EmailCampaignMessageEntity | null> {
    return this.repository.findOne({ where: { trackingToken } });
  }

  countDeliveredByCampaignId(campaignId: string): Promise<number> {
    return this.repository.count({
      where: { campaignId, deliveryStatus: 'sent' },
    });
  }

  countBouncedByCampaignId(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('message')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('message.deliveryStatus IN (:...statuses)', {
        statuses: ['bounced', 'failed'],
      })
      .andWhere('message.openCount = 0')
      .andWhere('message.clickCount = 0')
      .getCount();
  }

  countOpenedByCampaignId(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('message')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('message.openCount > 0')
      .getCount();
  }

  countClickedByCampaignId(campaignId: string): Promise<number> {
    return this.repository
      .createQueryBuilder('message')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('message.clickCount > 0')
      .getCount();
  }

  findByCampaignId(campaignId: string): Promise<EmailCampaignMessageEntity[]> {
    return this.repository.find({
      where: { campaignId },
      order: { stepOrder: 'ASC' },
    });
  }

  findByCampaignIdAndRecipientIds(
    campaignId: string,
    recipientIds: string[],
  ): Promise<EmailCampaignMessageEntity[]> {
    if (recipientIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.repository
      .createQueryBuilder('message')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('message.recipientId IN (:...recipientIds)', { recipientIds })
      .orderBy('message.stepOrder', 'ASC')
      .getMany();
  }

  findByProviderMessageId(
    providerMessageId: string,
  ): Promise<EmailCampaignMessageEntity | null> {
    const normalized = providerMessageId
      .trim()
      .replace(/^<|>$/g, '')
      .toLowerCase();

    return this.repository
      .createQueryBuilder('message')
      .where(
        "LOWER(REPLACE(REPLACE(message.providerMessageId, '<', ''), '>', '')) = :normalized",
        {
          normalized,
        },
      )
      .getOne();
  }

  findRecentSentByRecipientEmailInOrganization(
    organizationId: string,
    recipientEmail: string,
    since: Date,
  ): Promise<EmailCampaignMessageEntity[]> {
    return this.repository
      .createQueryBuilder('message')
      .innerJoin('message.campaign', 'campaign')
      .innerJoin('message.recipient', 'recipient')
      .where('campaign.organizationId = :organizationId', { organizationId })
      .andWhere('LOWER(recipient.email) = LOWER(:recipientEmail)', {
        recipientEmail,
      })
      .andWhere('message.deliveryStatus = :status', { status: 'sent' })
      .andWhere('message.sentAt >= :since', { since })
      .orderBy('message.sentAt', 'DESC')
      .getMany();
  }

  async findDistinctRecipientEmailsSentSince(
    organizationId: string,
    since: Date,
    mailboxId?: string,
  ): Promise<string[]> {
    const qb = this.repository
      .createQueryBuilder('message')
      .innerJoin('message.campaign', 'campaign')
      .innerJoin('message.recipient', 'recipient')
      .select('LOWER(recipient.email)', 'email')
      .where('campaign.organizationId = :organizationId', { organizationId })
      .andWhere('message.deliveryStatus = :status', { status: 'sent' })
      .andWhere('message.sentAt >= :since', { since });

    if (mailboxId) {
      qb.andWhere(
        '(message.mailboxId = :mailboxId OR message.mailboxId IS NULL)',
        { mailboxId },
      );
    }

    const rows = await qb
      .groupBy('recipient.email')
      .getRawMany<{ email: string }>();

    return rows.map((row) => row.email);
  }

  findScopedSentMessages(
    organizationId: string,
    recipientEmail: string,
    mailboxId: string,
    subject: string,
    since: Date,
    subjectMatch: 'exact' | 'reply_subject' = 'exact',
  ): Promise<EmailCampaignMessageEntity[]> {
    const qb = this.repository
      .createQueryBuilder('message')
      .innerJoin('message.campaign', 'campaign')
      .innerJoin('message.recipient', 'recipient')
      .where('campaign.organizationId = :organizationId', { organizationId })
      .andWhere('LOWER(recipient.email) = LOWER(:recipientEmail)', {
        recipientEmail,
      })
      .andWhere(
        '(message.mailboxId = :mailboxId OR message.mailboxId IS NULL)',
        { mailboxId },
      )
      .andWhere('message.deliveryStatus = :status', { status: 'sent' })
      .andWhere('message.sentAt >= :since', { since })
      .orderBy('message.sentAt', 'DESC');

    const normalizedSubject = subject.trim().toLowerCase();

    if (normalizedSubject.length > 0) {
      if (subjectMatch === 'reply_subject') {
        qb.andWhere(
          "(message.sentSubject IS NULL OR LOWER(:subject) LIKE CONCAT('%', LOWER(message.sentSubject), '%'))",
          { subject: normalizedSubject },
        );
      } else {
        qb.andWhere('LOWER(message.sentSubject) = LOWER(:subject)', {
          subject: normalizedSubject,
        });
      }
    }

    return qb.getMany();
  }

  countMissingProviderMessageIdByCampaignId(
    campaignId: string,
  ): Promise<number> {
    return this.repository
      .createQueryBuilder('message')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('message.deliveryStatus = :status', { status: 'sent' })
      .andWhere('message.providerMessageId IS NULL')
      .getCount();
  }

  async markMessageBounced(
    message: EmailCampaignMessageEntity,
    reason: string,
    bouncedAt = new Date(),
  ): Promise<EmailCampaignMessageEntity> {
    message.deliveryStatus = 'bounced';
    message.bouncedAt = bouncedAt;
    message.bounceReason = reason;
    return this.repository.save(message);
  }

  findEngagedButMarkedBounced(): Promise<EmailCampaignMessageEntity[]> {
    return this.repository
      .createQueryBuilder('message')
      .where('message.deliveryStatus IN (:...statuses)', {
        statuses: ['bounced', 'failed'],
      })
      .andWhere('(message.openCount > 0 OR message.clickCount > 0)')
      .getMany();
  }

  async revertFalseBounce(
    message: EmailCampaignMessageEntity,
  ): Promise<EmailCampaignMessageEntity> {
    message.deliveryStatus = 'sent';
    message.bouncedAt = null;
    message.bounceReason = null;
    return this.repository.save(message);
  }

  findRecentSentByRecipientEmail(
    campaignId: string,
    recipientEmail: string,
    since: Date,
  ): Promise<EmailCampaignMessageEntity[]> {
    return this.repository
      .createQueryBuilder('message')
      .innerJoin('message.recipient', 'recipient')
      .where('message.campaignId = :campaignId', { campaignId })
      .andWhere('LOWER(recipient.email) = LOWER(:recipientEmail)', {
        recipientEmail,
      })
      .andWhere('message.deliveryStatus = :status', { status: 'sent' })
      .andWhere('message.sentAt >= :since', { since })
      .orderBy('message.sentAt', 'DESC')
      .getMany();
  }

  countAll(): Promise<number> {
    return this.repository.count();
  }

  findPageOrderedByCreatedAt(
    skip: number,
    take: number,
  ): Promise<EmailCampaignMessageEntity[]> {
    return this.repository.find({
      order: { createdAt: 'ASC' },
      skip,
      take,
    });
  }

  findSentWithRepliedRecipientButNoOpen(): Promise<
    EmailCampaignMessageEntity[]
  > {
    return this.repository
      .createQueryBuilder('message')
      .innerJoinAndSelect('message.recipient', 'recipient')
      .where('message.deliveryStatus = :status', { status: 'sent' })
      .andWhere('message.openCount = 0')
      .andWhere('recipient.repliedAt IS NOT NULL')
      .orderBy('message.sentAt', 'DESC')
      .getMany();
  }

  async backfillMissingSendMetadata(): Promise<number> {
    const result: [unknown, number] = await this.repository.query(
      `UPDATE email_campaign_messages AS message
       SET mailbox_id = COALESCE(
             message.mailbox_id,
             (
               SELECT sender.mailbox_id::uuid
               FROM email_campaign_mailbox_senders AS sender
               WHERE sender.campaign_id = message.campaign_id
               ORDER BY sender.id ASC
               LIMIT 1
             )
           ),
           sent_subject = COALESCE(
             message.sent_subject,
             (
               SELECT step.subject
               FROM email_campaign_sequence_steps AS step
               WHERE step.campaign_id = message.campaign_id
                 AND step.step_order = message.step_order
               LIMIT 1
             )
           )
       WHERE message.mailbox_id IS NULL
          OR message.sent_subject IS NULL`,
    );

    return result[1] ?? 0;
  }
}
