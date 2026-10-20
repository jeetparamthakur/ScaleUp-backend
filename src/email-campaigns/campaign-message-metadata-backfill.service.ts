import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EmailCampaignMessagesRepository } from './email-campaign-messages.repository';

@Injectable()
export class CampaignMessageMetadataBackfillService implements OnModuleInit {
  private readonly logger = new Logger(
    CampaignMessageMetadataBackfillService.name,
  );

  constructor(
    private readonly messagesRepository: EmailCampaignMessagesRepository,
  ) {}

  onModuleInit(): void {
    setImmediate(() => {
      void this.backfillIfNeeded().catch((error: unknown) => {
        this.logger.warn(
          `Campaign message metadata backfill skipped: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      });
    });
  }

  async backfillIfNeeded(): Promise<number> {
    const updated = await this.messagesRepository.backfillMissingSendMetadata();

    if (updated > 0) {
      this.logger.log(
        `Backfilled send metadata for ${updated} campaign message(s)`,
      );
    }

    return updated;
  }
}
