import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { WhatsappListVisibility } from '../types/whatsapp-list-visibility';

export class WhatsappAdditionalFieldMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sourceColumn!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  secondarySourceColumn?: string;
}

export class WhatsappFieldMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  phone!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WhatsappAdditionalFieldMappingDto)
  additionalFields!: WhatsappAdditionalFieldMappingDto[];
}

export class CreateWhatsappListImportDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsIn(['org', 'private'])
  visibility!: WhatsappListVisibility;

  @ValidateNested()
  @Type(() => WhatsappFieldMappingDto)
  fieldMapping!: WhatsappFieldMappingDto;
}
