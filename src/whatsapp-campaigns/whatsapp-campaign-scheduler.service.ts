import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WhatsappCampaignSendService } from './whatsapp-campaign-send.service';
import { WhatsappCampaignsRepository } from './whatsapp-campaigns.repository';

@Injectable()
export class WhatsappCampaignSchedulerService {
  private readonly logger = new Logger(WhatsappCampaignSchedulerService.name);
  private isProcessing = false;

  constructor(
    private readonly campaignsRepository: WhatsappCampaignsRepository,
    private readonly sendService: WhatsappCampaignSendService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledCampaigns(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const campaigns = await this.campaignsRepository.findByStatuses([
        'scheduled',
        'sending',
      ]);

      for (const campaign of campaigns) {
        try {
          await this.sendService.processCampaign(campaign);
        } catch (error) {
          this.logger.error(
            `WhatsApp campaign scheduler failed for ${campaign.id}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
