import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWhatsappSenderConnectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}
