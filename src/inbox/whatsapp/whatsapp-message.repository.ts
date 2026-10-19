import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappMessageEntity } from './entities/whatsapp-message.entity';
import { mergeWhatsappMessageMediaMetadata } from './utils/whatsapp-message-media-metadata.util';

@Injectable()
export class WhatsappMessageRepository {
  constructor(
    @InjectRepository(WhatsappMessageEntity)
    private readonly repository: Repository<WhatsappMessageEntity>,
  ) {}

  findByIdInConversation(
    messageId: string,
    conversationId: string,
  ): Promise<WhatsappMessageEntity | null> {
    return this.repository.findOne({
      where: { id: messageId, conversationId },
    });
  }

  async mergeMediaMetadata(
    messageId: string,
    conversationId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const row = await this.findByIdInConversation(messageId, conversationId);
    if (!row) {
      return;
    }
    row.mediaMetadata = {
      ...(row.mediaMetadata ?? {}),
      ...patch,
    };
    await this.repository.save(row);
  }

  findByConversation(
    conversationId: string,
    limit: number,
    offset: number,
  ): Promise<[WhatsappMessageEntity[], number]> {
    return this.repository.findAndCount({
      where: { conversationId },
      order: { sentAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async upsertMessage(
    input: Pick<
      WhatsappMessageEntity,
      | 'conversationId'
      | 'externalId'
      | 'fromMe'
      | 'body'
      | 'messageType'
      | 'mediaMetadata'
      | 'sentAt'
    >,
  ): Promise<WhatsappMessageEntity> {
    const existing = await this.repository.findOne({
      where: {
        conversationId: input.conversationId,
        externalId: input.externalId,
      },
    });

    if (existing) {
      existing.fromMe = input.fromMe;
      existing.body = input.body;
      existing.messageType = input.messageType;
      existing.mediaMetadata = mergeWhatsappMessageMediaMetadata(
        existing.mediaMetadata,
        input.mediaMetadata,
      );
      existing.sentAt = input.sentAt;
      return this.repository.save(existing);
    }

    const created = this.repository.create(input);
    return this.repository.save(created);
  }
}
