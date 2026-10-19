import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type {
  WhatsappTemplateDelayMode,
  WhatsappTemplateType,
  WhatsappTemplateVisibility,
} from '../types/whatsapp-template.types';

export class CreateWhatsappTemplateStepDto {
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsIn(['relative', 'absolute'])
  delayMode?: WhatsappTemplateDelayMode;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(90)
  delayDays?: number;

  @ValidateIf(
    (step: CreateWhatsappTemplateStepDto) => step.delayMode === 'absolute',
  )
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduledDate must be a date in YYYY-MM-DD format',
  })
  scheduledDate?: string;
}

export class CreateWhatsappTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['single', 'sequence'])
  type!: WhatsappTemplateType;

  @IsOptional()
  @IsIn(['private', 'org'])
  visibility?: WhatsappTemplateVisibility;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWhatsappTemplateStepDto)
  steps!: CreateWhatsappTemplateStepDto[];
}

export class UpdateWhatsappTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['private', 'org'])
  visibility?: WhatsappTemplateVisibility;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateWhatsappTemplateStepDto)
  steps?: CreateWhatsappTemplateStepDto[];
}

export class ListWhatsappTemplatesQueryDto {
  @IsOptional()
  @IsIn(['single', 'sequence'])
  type?: WhatsappTemplateType;

  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;
}
