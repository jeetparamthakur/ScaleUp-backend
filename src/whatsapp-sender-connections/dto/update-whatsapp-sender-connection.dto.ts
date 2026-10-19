import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateWhatsappSenderConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  dailySendLimit?: number | null;
}
