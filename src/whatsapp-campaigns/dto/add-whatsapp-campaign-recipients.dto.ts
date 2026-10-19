import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const WHATSAPP_CAMPAIGN_ADD_RECIPIENTS_MAX = 500;

export class AddWhatsappCampaignManualContactDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;
}

export class AddWhatsappCampaignRecipientsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WHATSAPP_CAMPAIGN_ADD_RECIPIENTS_MAX)
  @ValidateNested({ each: true })
  @Type(() => AddWhatsappCampaignManualContactDto)
  manual?: AddWhatsappCampaignManualContactDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WHATSAPP_CAMPAIGN_ADD_RECIPIENTS_MAX)
  @IsUUID('4', { each: true })
  listMemberIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(WHATSAPP_CAMPAIGN_ADD_RECIPIENTS_MAX)
  @IsUUID('4', { each: true })
  prospectIds?: string[];
}
