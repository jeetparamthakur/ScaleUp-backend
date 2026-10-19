import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCampaignSenderEntity } from './entities/whatsapp-campaign-sender.entity';

@Injectable()
export class WhatsappCampaignSendersRepository {
  constructor(
    @InjectRepository(WhatsappCampaignSenderEntity)
    private readonly repository: Repository<WhatsappCampaignSenderEntity>,
  ) {}

  saveMany(
    rows: WhatsappCampaignSenderEntity[],
  ): Promise<WhatsappCampaignSenderEntity[]> {
    return this.repository.save(rows);
  }

  listByCampaign(campaignId: string): Promise<WhatsappCampaignSenderEntity[]> {
    return this.repository.find({
      where: { campaignId },
      order: { sortOrder: 'ASC' },
    });
  }
}
