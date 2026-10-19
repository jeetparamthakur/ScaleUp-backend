import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappConversationEntity } from './entities/whatsapp-conversation.entity';

@Injectable()
export class WhatsappConversationRepository {
  constructor(
    @InjectRepository(WhatsappConversationEntity)
    private readonly repository: Repository<WhatsappConversationEntity>,
  ) {}

  findByConnectionId(
    connectionId: string,
    limit: number,
    offset: number,
  ): Promise<[WhatsappConversationEntity[], number]> {
    return this.repository.findAndCount({
      where: { connectionId },
      order: { lastMessageAt: 'DESC', updatedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  findBySenderConnectionId(
    senderConnectionId: string,
    limit: number,
    offset: number,
  ): Promise<[WhatsappConversationEntity[], number]> {
    return this.repository.findAndCount({
      where: { senderConnectionId },
      order: { lastMessageAt: 'DESC', updatedAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  findById(conversationId: string): Promise<WhatsappConversationEntity | null> {
    return this.repository.findOne({ where: { id: conversationId } });
  }

  findByIdForConnection(
    conversationId: string,
    connectionId: string,
  ): Promise<WhatsappConversationEntity | null> {
    return this.repository.findOne({
      where: { id: conversationId, connectionId },
    });
  }

  findByIdForSenderConnection(
    conversationId: string,
    senderConnectionId: string,
  ): Promise<WhatsappConversationEntity | null> {
    return this.repository.findOne({
      where: { id: conversationId, senderConnectionId },
    });
  }

  findByConnectionAndChatId(
    connectionId: string,
    chatId: string,
  ): Promise<WhatsappConversationEntity | null> {
    return this.repository.findOne({
      where: { connectionId, chatId },
    });
  }

  findBySenderConnectionAndChatId(
    senderConnectionId: string,
    chatId: string,
  ): Promise<WhatsappConversationEntity | null> {
    return this.repository.findOne({
      where: { senderConnectionId, chatId },
    });
  }

  save(
    entity: WhatsappConversationEntity,
  ): Promise<WhatsappConversationEntity> {
    return this.repository.save(entity);
  }

  create(
    partial: Pick<WhatsappConversationEntity, 'chatId' | 'title' | 'isGroup'> &
      Partial<WhatsappConversationEntity>,
  ): WhatsappConversationEntity {
    return this.repository.create(partial);
  }
}
