import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { WhatsappCampaignRecipientStatus } from '../entities/whatsapp-campaign-recipient.entity';

export const WHATSAPP_CAMPAIGN_RECIPIENT_STATUS_FILTERS = [
  'pending',
  'sent',
  'failed',
  'skipped',
  'replied',
] as const satisfies readonly WhatsappCampaignRecipientStatus[];

export type WhatsappCampaignRecipientStatusFilter =
  (typeof WHATSAPP_CAMPAIGN_RECIPIENT_STATUS_FILTERS)[number];

export class WhatsappCampaignRecipientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsIn(WHATSAPP_CAMPAIGN_RECIPIENT_STATUS_FILTERS)
  status?: WhatsappCampaignRecipientStatusFilter;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

export class WhatsappCampaignRepliesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}
