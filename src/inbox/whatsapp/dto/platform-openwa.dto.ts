import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class UpdatePlatformOpenWaSettingsDto {
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'baseUrl must be a valid URL' })
  @MaxLength(512)
  baseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
