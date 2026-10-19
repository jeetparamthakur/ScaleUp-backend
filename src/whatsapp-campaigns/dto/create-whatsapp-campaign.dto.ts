import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { WhatsappCreateSequenceStepDto } from './whatsapp-campaign-sequence-step.dto';

export class CreateWhatsappCampaignDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WhatsappCreateSequenceStepDto)
  steps!: WhatsappCreateSequenceStepDto[];

  @IsUUID()
  contactListId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  senderConnectionIds!: string[];

  @IsOptional()
  @IsDateString()
  launchAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsInt()
  @Min(1)
  dailyBatchSize!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3600)
  sendIntervalSeconds?: number | null;

  @IsOptional()
  @IsBoolean()
  distributeRecipientsEqually?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  sendingWindowStartMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  sendingWindowEndMinutes?: number;
}
