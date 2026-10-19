import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserWhatsappConnectionEntity } from './entities/user-whatsapp-connection.entity';

@Injectable()
export class WhatsappConnectionRepository {
  constructor(
    @InjectRepository(UserWhatsappConnectionEntity)
    private readonly repository: Repository<UserWhatsappConnectionEntity>,
  ) {}

  findByOrgAndUser(
    organizationId: string,
    userId: string,
  ): Promise<UserWhatsappConnectionEntity | null> {
    return this.repository.findOne({
      where: { organizationId, userId },
    });
  }

  findById(id: string): Promise<UserWhatsappConnectionEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  save(
    entity: UserWhatsappConnectionEntity,
  ): Promise<UserWhatsappConnectionEntity> {
    return this.repository.save(entity);
  }

  create(
    partial: Pick<
      UserWhatsappConnectionEntity,
      'organizationId' | 'userId' | 'openwaSessionName'
    >,
  ): UserWhatsappConnectionEntity {
    return this.repository.create(partial);
  }
}
