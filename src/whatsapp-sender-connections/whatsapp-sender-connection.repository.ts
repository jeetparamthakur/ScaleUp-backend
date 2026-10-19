import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WhatsappSenderConnectionEntity } from './entities/whatsapp-sender-connection.entity';

@Injectable()
export class WhatsappSenderConnectionRepository {
  constructor(
    @InjectRepository(WhatsappSenderConnectionEntity)
    private readonly repository: Repository<WhatsappSenderConnectionEntity>,
  ) {}

  listByOrgAndUser(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappSenderConnectionEntity[]> {
    return this.repository.find({
      where: { organizationId, userId },
      order: { createdAt: 'DESC' },
    });
  }

  findByIdForUser(
    id: string,
    organizationId: string,
    userId: string,
  ): Promise<WhatsappSenderConnectionEntity | null> {
    return this.repository.findOne({
      where: { id, organizationId, userId },
    });
  }

  findById(id: string): Promise<WhatsappSenderConnectionEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  findByOpenwaSessionId(
    openwaSessionId: string,
  ): Promise<WhatsappSenderConnectionEntity[]> {
    return this.repository.find({
      where: { openwaSessionId },
    });
  }

  listReadyByIdsForOrg(
    organizationId: string,
    ids: string[],
  ): Promise<WhatsappSenderConnectionEntity[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.repository
      .createQueryBuilder('sender')
      .where('sender.organization_id = :organizationId', { organizationId })
      .andWhere('sender.id IN (:...ids)', { ids })
      .andWhere('sender.status = :status', { status: 'ready' })
      .getMany();
  }

  save(
    entity: WhatsappSenderConnectionEntity,
  ): Promise<WhatsappSenderConnectionEntity> {
    return this.repository.save(entity);
  }

  create(
    partial: Pick<
      WhatsappSenderConnectionEntity,
      'organizationId' | 'userId' | 'openwaSessionName' | 'displayName'
    >,
  ): WhatsappSenderConnectionEntity {
    return this.repository.create(partial);
  }

  async remove(entity: WhatsappSenderConnectionEntity): Promise<void> {
    await this.repository.remove(entity);
  }
}
