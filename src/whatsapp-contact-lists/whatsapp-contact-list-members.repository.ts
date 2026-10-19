import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { WhatsappContactListMemberEntity } from './entities/whatsapp-contact-list-member.entity';

export interface WhatsappListMembersQuery {
  search?: string;
  page: number;
  pageSize: number;
}

export interface PaginatedWhatsappListMembers {
  items: WhatsappContactListMemberEntity[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class WhatsappContactListMembersRepository {
  constructor(
    @InjectRepository(WhatsappContactListMemberEntity)
    private readonly memberRepository: Repository<WhatsappContactListMemberEntity>,
  ) {}

  findByListId(listId: string): Promise<WhatsappContactListMemberEntity[]> {
    return this.memberRepository.find({
      where: { listId },
      order: { createdAt: 'ASC' },
    });
  }

  findByListIdAndPhone(
    listId: string,
    phone: string,
  ): Promise<WhatsappContactListMemberEntity | null> {
    return this.memberRepository.findOne({
      where: { listId, phone },
    });
  }

  findByIdAndListId(
    memberId: string,
    listId: string,
  ): Promise<WhatsappContactListMemberEntity | null> {
    return this.memberRepository.findOne({
      where: { id: memberId, listId },
    });
  }

  findByIds(ids: string[]): Promise<WhatsappContactListMemberEntity[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    return this.memberRepository.find({
      where: { id: In(ids) },
    });
  }

  async findPaginatedByListId(
    listId: string,
    query: WhatsappListMembersQuery,
  ): Promise<PaginatedWhatsappListMembers> {
    const qb = this.memberRepository
      .createQueryBuilder('member')
      .where('member.listId = :listId', { listId });

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((where) => {
          where
            .where('LOWER(member.phone) LIKE :search', { search })
            .orWhere('LOWER(member.firstName) LIKE :search', { search })
            .orWhere('LOWER(member.lastName) LIKE :search', { search })
            .orWhere('LOWER(member.company) LIKE :search', { search });
        }),
      );
    }

    qb.orderBy('member.createdAt', 'ASC');

    const allMatches = await qb.getMany();
    const total = allMatches.length;
    const start = (query.page - 1) * query.pageSize;
    const items = allMatches.slice(start, start + query.pageSize);

    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
