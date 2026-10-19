import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WhatsappCampaignEventEntity,
  type WhatsappCampaignEventType,
} from './entities/whatsapp-campaign-event.entity';

@Injectable()
export class WhatsappCampaignEventsRepository {
  constructor(
    @InjectRepository(WhatsappCampaignEventEntity)
    private readonly repository: Repository<WhatsappCampaignEventEntity>,
  ) {}

  createEvent(input: {
    campaignId: string;
    recipientId?: string | null;
    eventType: WhatsappCampaignEventType;
    metadata?: Record<string, unknown> | null;
  }): Promise<WhatsappCampaignEventEntity> {
    const row = this.repository.create({
      campaignId: input.campaignId,
      recipientId: input.recipientId ?? null,
      eventType: input.eventType,
      metadata: input.metadata ?? null,
    });
    return this.repository.save(row);
  }
}
