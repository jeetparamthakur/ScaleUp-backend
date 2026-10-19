import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappCampaignMessageEntity } from './entities/whatsapp-campaign-message.entity';

@Injectable()
export class WhatsappCampaignMessagesRepository {
  constructor(
    @InjectRepository(WhatsappCampaignMessageEntity)
    private readonly repository: Repository<WhatsappCampaignMessageEntity>,
  ) {}

  createMessage(input: {
    recipientId: string;
    externalMessageId: string;
    body: string;
    stepOrder: number;
  }): Promise<WhatsappCampaignMessageEntity> {
    const row = this.repository.create(input);
    return this.repository.save(row);
  }
}
