import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export const WHATSAPP_DASHBOARD_DEFAULT_DAYS = 30;
export const WHATSAPP_DASHBOARD_MAX_DAYS = 90;

export class WhatsappDashboardQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WHATSAPP_DASHBOARD_MAX_DAYS)
  days?: number = WHATSAPP_DASHBOARD_DEFAULT_DAYS;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsUUID()
  campaignId?: string;
}
