import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { WhatsappFieldMappingDto } from './create-whatsapp-list-import.dto';
import type { WhatsappListVisibility } from '../types/whatsapp-list-visibility';

export class CreateWhatsappContactListDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsIn(['org', 'private'])
  visibility!: WhatsappListVisibility;
}

export class UpdateWhatsappContactListDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsIn(['org', 'private'])
  visibility?: WhatsappListVisibility;
}

export class CreateWhatsappListMemberDto {
  @IsString()
  @IsNotEmpty()
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

  @IsOptional()
  @IsObject()
  customFields?: Record<string, string>;
}

export class AppendWhatsappListImportDto {
  @ValidateNested()
  @Type(() => WhatsappFieldMappingDto)
  fieldMapping!: WhatsappFieldMappingDto;
}

export class WhatsappListMembersQueryDto {
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
  pageSize?: number = 25;
}
