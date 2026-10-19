import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, Repository } from 'typeorm';
import { WhatsappCampaignEntity } from '../whatsapp-campaigns/entities/whatsapp-campaign.entity';
import { WhatsappContactListMemberEntity } from './entities/whatsapp-contact-list-member.entity';
import { WhatsappContactListEntity } from './entities/whatsapp-contact-list.entity';
import type { WhatsappListFieldSchema } from './types/whatsapp-list-field-schema';
import type { WhatsappListVisibility } from './types/whatsapp-list-visibility';

export interface WhatsappListMemberInsert {
  phone: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  customFields: Record<string, string>;
}

@Injectable()
export class WhatsappContactListsRepository {
  constructor(
    @InjectRepository(WhatsappContactListEntity)
    private readonly listRepository: Repository<WhatsappContactListEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  findVisibleForUser(
    organizationId: string,
    userId: string,
  ): Promise<WhatsappContactListEntity[]> {
    return this.listRepository
      .createQueryBuilder('list')
      .where('list.organizationId = :organizationId', { organizationId })
      .andWhere(
        new Brackets((where) => {
          where
            .where('list.visibility = :orgVisibility', { orgVisibility: 'org' })
            .orWhere(
              '(list.visibility = :privateVisibility AND list.createdByUserId = :userId)',
              { privateVisibility: 'private', userId },
            );
        }),
      )
      .orderBy('list.createdAt', 'DESC')
      .getMany();
  }

  findByIdAndOrganizationId(
    id: string,
    organizationId: string,
  ): Promise<WhatsappContactListEntity | null> {
    return this.listRepository.findOne({
      where: { id, organizationId },
    });
  }

  save(entity: WhatsappContactListEntity): Promise<WhatsappContactListEntity> {
    return this.listRepository.save(entity);
  }

  countCampaignsUsingList(
    listId: string,
    organizationId: string,
  ): Promise<number> {
    return this.dataSource.getRepository(WhatsappCampaignEntity).count({
      where: { contactListId: listId, organizationId },
    });
  }

  async deleteList(list: WhatsappContactListEntity): Promise<void> {
    await this.listRepository.remove(list);
  }

  createEmptyList(
    organizationId: string,
    name: string,
    visibility: WhatsappListVisibility,
    createdByUserId: string,
    fieldSchema: WhatsappListFieldSchema,
  ): Promise<WhatsappContactListEntity> {
    const list = this.listRepository.create({
      organizationId,
      name,
      visibility,
      createdByUserId,
      contactCount: 0,
      fieldSchema,
    });

    return this.listRepository.save(list);
  }

  async importListWithMembers(
    organizationId: string,
    name: string,
    visibility: WhatsappListVisibility,
    createdByUserId: string,
    members: WhatsappListMemberInsert[],
    fieldSchema: WhatsappListFieldSchema,
  ): Promise<WhatsappContactListEntity> {
    return this.dataSource.transaction(async (manager) => {
      const listRepo = manager.getRepository(WhatsappContactListEntity);
      const memberRepo = manager.getRepository(WhatsappContactListMemberEntity);

      const list = listRepo.create({
        organizationId,
        name,
        contactCount: 0,
        fieldSchema,
        visibility,
        createdByUserId,
      });

      const savedList = await listRepo.save(list);

      if (members.length > 0) {
        const memberEntities = members.map((member) =>
          memberRepo.create({
            organizationId,
            listId: savedList.id,
            phone: member.phone,
            firstName: member.firstName,
            lastName: member.lastName,
            company: member.company,
            customFields: member.customFields,
          }),
        );

        await memberRepo.upsert(memberEntities, {
          conflictPaths: ['listId', 'phone'],
          skipUpdateIfNoValuesChanged: true,
        });
      }

      savedList.contactCount = members.length;
      return listRepo.save(savedList);
    });
  }

  async addMemberAndIncrementCount(
    list: WhatsappContactListEntity,
    member: WhatsappListMemberInsert,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const listRepo = manager.getRepository(WhatsappContactListEntity);
      const memberRepo = manager.getRepository(WhatsappContactListMemberEntity);

      const existing = await memberRepo.findOne({
        where: { listId: list.id, phone: member.phone },
      });

      if (existing) {
        throw new Error('DUPLICATE_MEMBER');
      }

      await memberRepo.save(
        memberRepo.create({
          organizationId: list.organizationId,
          listId: list.id,
          phone: member.phone,
          firstName: member.firstName,
          lastName: member.lastName,
          company: member.company,
          customFields: member.customFields,
        }),
      );

      list.contactCount += 1;
      await listRepo.save(list);
    });
  }

  async deleteMemberAndDecrementCount(
    list: WhatsappContactListEntity,
    memberId: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const listRepo = manager.getRepository(WhatsappContactListEntity);
      const memberRepo = manager.getRepository(WhatsappContactListMemberEntity);

      const member = await memberRepo.findOne({
        where: { id: memberId, listId: list.id },
      });

      if (!member) {
        return false;
      }

      await memberRepo.delete({ id: member.id });
      list.contactCount = Math.max(0, list.contactCount - 1);
      await listRepo.save(list);

      return true;
    });
  }

  async appendMembersAndUpdateCount(
    list: WhatsappContactListEntity,
    members: WhatsappListMemberInsert[],
  ): Promise<{
    list: WhatsappContactListEntity;
    importedCount: number;
    importedPhones: string[];
  }> {
    return this.dataSource.transaction(async (manager) => {
      const listRepo = manager.getRepository(WhatsappContactListEntity);
      const memberRepo = manager.getRepository(WhatsappContactListMemberEntity);

      const existingMembers = await memberRepo.find({
        where: { listId: list.id },
        select: { phone: true },
      });
      const existingPhones = new Set(existingMembers.map((m) => m.phone));

      const newMembers = members.filter(
        (member) => !existingPhones.has(member.phone),
      );

      if (newMembers.length > 0) {
        const memberEntities = newMembers.map((member) =>
          memberRepo.create({
            organizationId: list.organizationId,
            listId: list.id,
            phone: member.phone,
            firstName: member.firstName,
            lastName: member.lastName,
            company: member.company,
            customFields: member.customFields,
          }),
        );

        await memberRepo.save(memberEntities);
      }

      list.contactCount = existingPhones.size + newMembers.length;
      const savedList = await listRepo.save(list);

      return {
        list: savedList,
        importedCount: newMembers.length,
        importedPhones: newMembers.map((member) => member.phone),
      };
    });
  }
}
