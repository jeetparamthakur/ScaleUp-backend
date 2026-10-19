import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class WhatsappConversationsQueryDto {
  @IsUUID()
  senderConnectionId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class WhatsappProfilePicturesQueryDto {
  @IsUUID()
  senderConnectionId!: string;

  /** Comma-separated WhatsApp chat / contact ids (max 50). */
  @IsString()
  @MaxLength(8000)
  ids!: string;
}

export class WhatsappMessagesQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
