import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class WhatsappCreateSequenceStepDto {
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsInt()
  @Min(0)
  @Max(90)
  delayDays!: number;

  @IsOptional()
  @IsIn(['relative', 'absolute'])
  delayMode?: 'relative' | 'absolute';

  @ValidateIf(
    (step: WhatsappCreateSequenceStepDto) => step.delayMode === 'absolute',
  )
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduledDate must be a date in YYYY-MM-DD format',
  })
  scheduledDate?: string;
}
