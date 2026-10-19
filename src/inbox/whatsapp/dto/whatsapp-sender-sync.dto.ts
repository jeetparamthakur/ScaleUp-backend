import { IsOptional, IsUUID } from 'class-validator';

export class WhatsappSenderSyncDto {
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
