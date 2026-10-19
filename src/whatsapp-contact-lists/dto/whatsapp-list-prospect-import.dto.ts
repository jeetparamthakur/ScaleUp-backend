import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { WhatsappListVisibility } from '../types/whatsapp-list-visibility';

export const WHATSAPP_LIST_PROSPECT_IMPORT_MAX_IDS = 500;

export class ImportWhatsappListFromProspectsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsIn(['org', 'private'])
  visibility!: WhatsappListVisibility;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(WHATSAPP_LIST_PROSPECT_IMPORT_MAX_IDS)
  @IsUUID('4', { each: true })
  prospectIds!: string[];
}

export class AppendWhatsappListFromProspectsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(WHATSAPP_LIST_PROSPECT_IMPORT_MAX_IDS)
  @IsUUID('4', { each: true })
  prospectIds!: string[];
}
