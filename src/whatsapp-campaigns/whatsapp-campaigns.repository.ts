import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { WhatsappCampaignEntity } from './entities/whatsapp-campaign.entity';

@Injectable()
export class WhatsappCampaignsRepository {
  constructor(
    @InjectRepository(WhatsappCampaignEntity)
    private readonly repository: Repository<WhatsappCampaignEntity>,
  ) {}

  findByIdForOrg(
    id: string,
    organizationId: string,
  ): Promise<WhatsappCampaignEntity | null> {
    return this.repository.findOne({
      where: { id, organizationId },
      relations: { senders: true },
    });
  }

  listByOrg(organizationId: string): Promise<WhatsappCampaignEntity[]> {
    return this.repository.find({
      where: { organizationId },
      order: { createdAt: 'DESC' },
    });
  }

  findByStatuses(
    statuses: WhatsappCampaignEntity['status'][],
  ): Promise<WhatsappCampaignEntity[]> {
    return this.repository.find({
      where: { status: In(statuses) },
      relations: { senders: true },
    });
  }

  save(entity: WhatsappCampaignEntity): Promise<WhatsappCampaignEntity> {
    return this.repository.save(entity);
  }

  create(
    partial: Pick<
      WhatsappCampaignEntity,
      | 'organizationId'
      | 'createdByUserId'
      | 'name'
      | 'messageBody'
      | 'contactListId'
      | 'launchAt'
      | 'timezone'
      | 'dailyBatchSize'
      | 'sendIntervalSeconds'
      | 'sendingWindowStartMinutes'
      | 'sendingWindowEndMinutes'
      | 'distributeRecipientsEqually'
    >,
  ): WhatsappCampaignEntity {
    return this.repository.create(partial);
  }
}
