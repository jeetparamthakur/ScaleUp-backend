import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCampaignSequenceStepEntity } from './entities/whatsapp-campaign-sequence-step.entity';

@Injectable()
export class WhatsappCampaignSequenceStepsRepository {
  constructor(
    @InjectRepository(WhatsappCampaignSequenceStepEntity)
    private readonly repository: Repository<WhatsappCampaignSequenceStepEntity>,
  ) {}

  saveMany(
    rows: WhatsappCampaignSequenceStepEntity[],
  ): Promise<WhatsappCampaignSequenceStepEntity[]> {
    return this.repository.save(rows);
  }

  listByCampaignId(
    campaignId: string,
  ): Promise<WhatsappCampaignSequenceStepEntity[]> {
    return this.repository.find({
      where: { campaignId },
      order: { stepOrder: 'ASC' },
    });
  }
}
