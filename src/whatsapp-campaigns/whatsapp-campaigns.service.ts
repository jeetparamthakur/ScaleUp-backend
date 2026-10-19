import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUserProfile } from '../auth/auth.service';
import { getMinutesFromMidnightInTimezone } from '../email-campaigns/campaign-schedule.util';
import type { CreateWhatsappListMemberDto } from '../whatsapp-contact-lists/dto/whatsapp-list-detail.dto';
import {
  canonicalWhatsappPhoneE164,
  normalizeWhatsappPhone,
} from '../whatsapp-contact-lists/utils/normalize-whatsapp-phone.util';
import { WhatsappContactListMembersRepository } from '../whatsapp-contact-lists/whatsapp-contact-list-members.repository';
import { WhatsappContactListsRepository } from '../whatsapp-contact-lists/whatsapp-contact-lists.repository';
import { WhatsappContactListsService } from '../whatsapp-contact-lists/whatsapp-contact-lists.service';
import { WhatsappSenderConnectionRepository } from '../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import { WhatsappCampaignSenderEntity } from './entities/whatsapp-campaign-sender.entity';
import type { WhatsappCampaignEntity } from './entities/whatsapp-campaign.entity';
import {
  assignNewRecipientsToLeastLoadedSenders,
  assignRecipientsToSendersEqually,
} from './utils/distribute-recipients.util';
import type {
  PaginatedWhatsappCampaignRepliesResponse,
  PaginatedWhatsappCampaignRecipientsResponse,
} from './mappers/whatsapp-campaign-recipient.mapper';
import { WhatsappCampaignRecipientMapper } from './mappers/whatsapp-campaign-recipient.mapper';
import type { WhatsappCampaignRecipientsQueryDto } from './dto/whatsapp-campaign-recipients-query.dto';
import type { WhatsappCampaignRepliesQueryDto } from './dto/whatsapp-campaign-recipients-query.dto';
import type { AddWhatsappCampaignRecipientsDto } from './dto/add-whatsapp-campaign-recipients.dto';
import type { WhatsappCampaignAddableMembersQueryDto } from './dto/whatsapp-campaign-addable-members-query.dto';
import type { CreateWhatsappCampaignDto } from './dto/create-whatsapp-campaign.dto';
import { WhatsappCampaignSequenceStepEntity } from './entities/whatsapp-campaign-sequence-step.entity';
import { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';
import { WhatsappCampaignSendersRepository } from './whatsapp-campaign-senders.repository';
import { WhatsappCampaignSequenceStepsRepository } from './whatsapp-campaign-sequence-steps.repository';
import { WhatsappCampaignsRepository } from './whatsapp-campaigns.repository';
import {
  buildWhatsappSequenceStepEntities,
  validateWhatsappCampaignSteps,
} from './utils/whatsapp-campaign-sequence.validation';
import type { WhatsappSenderConnectionEntity } from '../whatsapp-sender-connections/entities/whatsapp-sender-connection.entity';

export interface WhatsappCampaignProgress {
  pending: number;
  sent: number;
  failed: number;
  replied: number;
  skipped: number;
}

export interface WhatsappCampaignAddableMemberView {
  id: string;
  phone: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

export interface PaginatedWhatsappCampaignAddableMembersResponse {
  items: WhatsappCampaignAddableMemberView[];
  total: number;
  page: number;
  limit: number;
}

export interface AddWhatsappCampaignRecipientsResult {
  addedCount: number;
  skippedDuplicateCount: number;
  skippedInvalidCount: number;
  items: PaginatedWhatsappCampaignRecipientsResponse['items'];
}

export interface WhatsappCampaignDetailView {
  id: string;
  name: string;
  messageBody: string;
  contactListId: string;
  status: WhatsappCampaignEntity['status'];
  launchAt: string | null;
  timezone: string | null;
  transport: WhatsappCampaignEntity['transport'];
  senderConnectionIds: string[];
  dailyBatchSize: number;
  sendIntervalSeconds: number | null;
  sendingWindowStartMinutes: number | null;
  sendingWindowEndMinutes: number | null;
  distributeRecipientsEqually: boolean;
  progress: WhatsappCampaignProgress;
  createdAt: string;
}

@Injectable()
export class WhatsappCampaignsService {
  constructor(
    private readonly campaignsRepository: WhatsappCampaignsRepository,
    private readonly sendersRepository: WhatsappCampaignSendersRepository,
    private readonly recipientsRepository: WhatsappCampaignRecipientsRepository,
    private readonly contactListsRepository: WhatsappContactListsRepository,
    private readonly contactListsService: WhatsappContactListsService,
    private readonly listMembersRepository: WhatsappContactListMembersRepository,
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
    private readonly recipientMapper: WhatsappCampaignRecipientMapper,
    private readonly sequenceStepsRepository: WhatsappCampaignSequenceStepsRepository,
  ) {}

  async list(organizationId: string): Promise<WhatsappCampaignDetailView[]> {
    const campaigns = await this.campaignsRepository.listByOrg(organizationId);
    const views: WhatsappCampaignDetailView[] = [];

    for (const campaign of campaigns) {
      views.push(await this.toDetailView(campaign));
    }

    return views;
  }

  async get(
    organizationId: string,
    campaignId: string,
  ): Promise<WhatsappCampaignDetailView> {
    const campaign = await this.requireCampaign(organizationId, campaignId);
    return this.toDetailView(campaign);
  }

  async create(
    organizationId: string,
    userId: string,
    input: CreateWhatsappCampaignDto,
  ): Promise<WhatsappCampaignDetailView> {
    validateWhatsappCampaignSteps(input.steps);

    const sortedSteps = [...input.steps].sort(
      (a, b) => a.stepOrder - b.stepOrder,
    );
    const initialBody = sortedSteps[0].body.trim();
    const list = await this.contactListsRepository.findByIdAndOrganizationId(
      input.contactListId,
      organizationId,
    );
    if (!list) {
      throw new NotFoundException('WhatsApp contact list not found');
    }

    const resolvedSenders: WhatsappSenderConnectionEntity[] = [];
    for (const senderId of input.senderConnectionIds) {
      const sender = await this.senderConnectionRepository.findByIdForUser(
        senderId,
        organizationId,
        userId,
      );
      if (!sender) {
        throw new BadRequestException(
          'You can only use WhatsApp numbers you connected',
        );
      }
      resolvedSenders.push(sender);
    }

    this.validateDailyBatchAgainstSenderLimits(
      input.dailyBatchSize,
      resolvedSenders,
    );

    let launchAtDate: Date | null = null;
    if (input.launchAt) {
      launchAtDate = new Date(input.launchAt);
      if (Number.isNaN(launchAtDate.getTime())) {
        throw new BadRequestException('Invalid launch time');
      }
      if (launchAtDate.getTime() < Date.now() - 60_000) {
        throw new BadRequestException('Launch time must be in the future');
      }
    }

    const { sendingWindowStartMinutes, sendingWindowEndMinutes } =
      this.resolveSendingWindow(input, launchAtDate);

    const distributeRecipientsEqually =
      Boolean(input.distributeRecipientsEqually) &&
      input.senderConnectionIds.length > 1;

    const members = await this.listMembersRepository.findByListId(list.id);
    if (members.length === 0) {
      throw new BadRequestException('Contact list has no members');
    }

    let campaign = this.campaignsRepository.create({
      organizationId,
      createdByUserId: userId,
      name: input.name.trim(),
      messageBody: initialBody,
      contactListId: list.id,
      launchAt: launchAtDate,
      timezone: input.timezone?.trim() || null,
      dailyBatchSize: input.dailyBatchSize,
      sendIntervalSeconds: input.sendIntervalSeconds ?? null,
      sendingWindowStartMinutes,
      sendingWindowEndMinutes,
      distributeRecipientsEqually,
    });
    campaign = await this.campaignsRepository.save(campaign);

    const stepRows = buildWhatsappSequenceStepEntities(
      input.steps,
      campaign.id,
    ).map((partial) => {
      const row = new WhatsappCampaignSequenceStepEntity();
      Object.assign(row, partial);
      return row;
    });
    await this.sequenceStepsRepository.saveMany(stepRows);

    const senderRows = input.senderConnectionIds.map((id, index) => {
      const row = new WhatsappCampaignSenderEntity();
      row.campaignId = campaign.id;
      row.senderConnectionId = id;
      row.sortOrder = index;
      return row;
    });
    await this.sendersRepository.saveMany(senderRows);

    const recipientRows: WhatsappCampaignRecipientEntity[] = [];
    const seenPhones = new Set<string>();

    for (const member of members) {
      const phone = canonicalWhatsappPhoneE164(member.phone);
      if (!phone || seenPhones.has(phone)) {
        continue;
      }
      seenPhones.add(phone);

      const recipient = new WhatsappCampaignRecipientEntity();
      recipient.campaignId = campaign.id;
      recipient.organizationId = organizationId;
      recipient.listMemberId = member.id;
      recipient.phoneE164 = phone;
      recipient.status = 'pending';
      recipient.currentStepOrder = 1;
      recipient.nextSendAt = null;
      recipientRows.push(recipient);
    }

    if (recipientRows.length === 0) {
      throw new BadRequestException('No valid phone numbers in contact list');
    }

    if (distributeRecipientsEqually) {
      assignRecipientsToSendersEqually(
        recipientRows,
        input.senderConnectionIds,
      );
    }

    await this.recipientsRepository.saveMany(recipientRows);

    return this.toDetailView(campaign);
  }

  async listRecipients(
    organizationId: string,
    campaignId: string,
    query: WhatsappCampaignRecipientsQueryDto,
  ): Promise<PaginatedWhatsappCampaignRecipientsResponse> {
    await this.requireCampaign(organizationId, campaignId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const pageResult = await this.recipientsRepository.listByCampaign(
      organizationId,
      campaignId,
      {
        search: query.search,
        status: query.status,
        page,
        limit,
      },
    );

    const memberMap = await this.loadMemberMapForRecipients(pageResult.items);

    return {
      items: pageResult.items.map((recipient) =>
        this.recipientMapper.toRecipientResponse(
          recipient,
          recipient.listMemberId
            ? (memberMap.get(recipient.listMemberId) ?? null)
            : null,
        ),
      ),
      total: pageResult.total,
      page: pageResult.page,
      limit: pageResult.limit,
    };
  }

  async listReplies(
    organizationId: string,
    campaignId: string,
    query: WhatsappCampaignRepliesQueryDto,
  ): Promise<PaginatedWhatsappCampaignRepliesResponse> {
    await this.requireCampaign(organizationId, campaignId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const pageResult = await this.recipientsRepository.listRepliesByCampaign(
      organizationId,
      campaignId,
      {
        search: query.search,
        page,
        limit,
      },
    );

    const memberMap = await this.loadMemberMapForRecipients(pageResult.items);

    return {
      items: pageResult.items
        .filter((recipient) => recipient.repliedAt !== null)
        .map((recipient) =>
          this.recipientMapper.toReplyResponse(
            recipient,
            recipient.listMemberId
              ? (memberMap.get(recipient.listMemberId) ?? null)
              : null,
          ),
        ),
      total: pageResult.total,
      page: pageResult.page,
      limit: pageResult.limit,
    };
  }

  async listAddableMembers(
    organizationId: string,
    campaignId: string,
    query: WhatsappCampaignAddableMembersQueryDto,
  ): Promise<PaginatedWhatsappCampaignAddableMembersResponse> {
    const campaign = await this.requireCampaign(organizationId, campaignId);

    if (campaign.status !== 'scheduled' && campaign.status !== 'sending') {
      throw new BadRequestException(
        'Contacts can only be added while a campaign is scheduled or sending',
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const pageResult =
      await this.recipientsRepository.listAddableMembersForCampaign(
        organizationId,
        campaign.id,
        campaign.contactListId,
        { search: query.search, page, limit },
      );

    return {
      items: pageResult.items.map((member) => ({
        id: member.id,
        phone: member.phone,
        firstName: member.firstName,
        lastName: member.lastName,
        company: member.company,
      })),
      total: pageResult.total,
      page: pageResult.page,
      limit: pageResult.limit,
    };
  }

  async addRecipients(
    organizationId: string,
    campaignId: string,
    user: AuthUserProfile,
    input: AddWhatsappCampaignRecipientsDto,
  ): Promise<AddWhatsappCampaignRecipientsResult> {
    const manual = input.manual ?? [];
    const listMemberIds = input.listMemberIds ?? [];
    const prospectIds = input.prospectIds ?? [];

    if (
      manual.length === 0 &&
      listMemberIds.length === 0 &&
      prospectIds.length === 0
    ) {
      throw new BadRequestException('At least one contact source is required');
    }

    const campaign = await this.requireCampaign(organizationId, campaignId);

    if (campaign.status !== 'scheduled' && campaign.status !== 'sending') {
      throw new BadRequestException(
        'Recipients can only be added while a campaign is scheduled or sending',
      );
    }

    const candidates = new Map<
      string,
      { phoneE164: string; listMemberId: string | null }
    >();
    let skippedInvalidCount = 0;

    if (listMemberIds.length > 0) {
      const members = await this.listMembersRepository.findByIds(listMemberIds);

      for (const memberId of listMemberIds) {
        const member = members.find((row) => row.id === memberId);

        if (!member || member.listId !== campaign.contactListId) {
          throw new BadRequestException(
            'One or more contacts are not on this campaign’s WhatsApp list',
          );
        }

        const phoneE164 = canonicalWhatsappPhoneE164(member.phone);

        if (!phoneE164) {
          skippedInvalidCount += 1;
          continue;
        }

        candidates.set(phoneE164, {
          phoneE164,
          listMemberId: member.id,
        });
      }
    }

    if (prospectIds.length > 0) {
      const members =
        await this.contactListsService.appendProspectsAndResolveMembers(
          campaign.contactListId,
          prospectIds,
          organizationId,
          user,
        );

      for (const member of members) {
        const phoneE164 = canonicalWhatsappPhoneE164(member.phone);

        if (!phoneE164) {
          skippedInvalidCount += 1;
          continue;
        }

        candidates.set(phoneE164, {
          phoneE164,
          listMemberId: member.id,
        });
      }
    }

    for (const row of manual) {
      const listPhone = normalizeWhatsappPhone(row.phone);

      if (!listPhone) {
        skippedInvalidCount += 1;
        continue;
      }

      let member = await this.listMembersRepository.findByListIdAndPhone(
        campaign.contactListId,
        listPhone,
      );

      if (!member) {
        const dto: CreateWhatsappListMemberDto = {
          phone: row.phone,
          firstName: row.firstName,
          lastName: row.lastName,
          company: row.company,
        };

        try {
          await this.contactListsService.addMember(
            campaign.contactListId,
            dto,
            organizationId,
            user,
          );
        } catch (error) {
          if (error instanceof BadRequestException) {
            skippedInvalidCount += 1;
            continue;
          }

          if (!(error instanceof ConflictException)) {
            throw error;
          }
        }

        member = await this.listMembersRepository.findByListIdAndPhone(
          campaign.contactListId,
          listPhone,
        );
      }

      if (!member) {
        skippedInvalidCount += 1;
        continue;
      }

      const phoneE164 = canonicalWhatsappPhoneE164(member.phone);

      if (!phoneE164) {
        skippedInvalidCount += 1;
        continue;
      }

      candidates.set(phoneE164, {
        phoneE164,
        listMemberId: member.id,
      });
    }

    const candidatePhones = [...candidates.keys()];
    const alreadyOnCampaign =
      await this.recipientsRepository.findPhonesAlreadyOnCampaign(
        campaign.id,
        candidatePhones,
      );
    const alreadyOnCampaignDigits = new Set(
      [...alreadyOnCampaign].map((phone) => phone.replace(/\D/g, '')),
    );

    let skippedDuplicateCount = 0;
    const toInsert: WhatsappCampaignRecipientEntity[] = [];

    for (const candidate of candidates.values()) {
      if (alreadyOnCampaignDigits.has(candidate.phoneE164.replace(/\D/g, ''))) {
        skippedDuplicateCount += 1;
        continue;
      }

      const recipient = new WhatsappCampaignRecipientEntity();
      recipient.campaignId = campaign.id;
      recipient.organizationId = organizationId;
      recipient.listMemberId = candidate.listMemberId;
      recipient.phoneE164 = candidate.phoneE164;
      recipient.status = 'pending';
      recipient.currentStepOrder = 1;
      recipient.nextSendAt = null;
      toInsert.push(recipient);
    }

    if (toInsert.length === 0) {
      throw new BadRequestException(
        'No new recipients to add. Contacts may already be on this campaign or have invalid phone numbers.',
      );
    }

    if (campaign.distributeRecipientsEqually) {
      const senders = await this.sendersRepository.listByCampaign(campaign.id);
      const senderIds = senders.map((row) => row.senderConnectionId);
      const existingCountBySender =
        await this.recipientsRepository.countBySenderForCampaign(campaign.id);
      assignNewRecipientsToLeastLoadedSenders(
        toInsert,
        senderIds,
        existingCountBySender,
      );
    }

    const saved = await this.recipientsRepository.saveMany(toInsert);
    const memberMap = await this.loadMemberMapForRecipients(saved);

    return {
      addedCount: saved.length,
      skippedDuplicateCount,
      skippedInvalidCount,
      items: saved.map((recipient) =>
        this.recipientMapper.toRecipientResponse(
          recipient,
          recipient.listMemberId
            ? (memberMap.get(recipient.listMemberId) ?? null)
            : null,
        ),
      ),
    };
  }

  async schedule(
    organizationId: string,
    campaignId: string,
  ): Promise<WhatsappCampaignDetailView> {
    const campaign = await this.requireCampaign(organizationId, campaignId);

    if (campaign.status !== 'draft') {
      throw new BadRequestException('Only draft campaigns can be scheduled');
    }

    const steps = await this.sequenceStepsRepository.listByCampaignId(
      campaign.id,
    );
    if (steps.length === 0) {
      throw new BadRequestException('Campaign sequence is required');
    }

    const senders = await this.sendersRepository.listByCampaign(campaign.id);
    const ready = await this.senderConnectionRepository.listReadyByIdsForOrg(
      organizationId,
      senders.map((row) => row.senderConnectionId),
    );
    if (ready.length === 0) {
      throw new BadRequestException(
        'At least one selected sender must be connected and ready in WhatsApp settings',
      );
    }

    if (!campaign.launchAt) {
      campaign.launchAt = new Date();
    }

    campaign.status = 'scheduled';
    await this.campaignsRepository.save(campaign);

    return this.toDetailView(campaign);
  }

  private async loadMemberMapForRecipients(
    recipients: WhatsappCampaignRecipientEntity[],
  ) {
    const memberIds = [
      ...new Set(
        recipients
          .map((row) => row.listMemberId)
          .filter((id): id is string => id !== null),
      ),
    ];

    if (memberIds.length === 0) {
      return this.recipientMapper.buildMemberMap([]);
    }

    const members = await this.listMembersRepository.findByIds(memberIds);
    return this.recipientMapper.buildMemberMap(members);
  }

  private async requireCampaign(
    organizationId: string,
    campaignId: string,
  ): Promise<WhatsappCampaignEntity> {
    const campaign = await this.campaignsRepository.findByIdForOrg(
      campaignId,
      organizationId,
    );
    if (!campaign) {
      throw new NotFoundException('WhatsApp campaign not found');
    }
    return campaign;
  }

  private async toDetailView(
    campaign: WhatsappCampaignEntity,
  ): Promise<WhatsappCampaignDetailView> {
    const senders = await this.sendersRepository.listByCampaign(campaign.id);

    const progress: WhatsappCampaignProgress = {
      pending: await this.recipientsRepository.countByCampaignAndStatus(
        campaign.id,
        'pending',
      ),
      sent: await this.recipientsRepository.countByCampaignAndStatus(
        campaign.id,
        'sent',
      ),
      failed: await this.recipientsRepository.countByCampaignAndStatus(
        campaign.id,
        'failed',
      ),
      replied: await this.recipientsRepository.countByCampaignAndStatus(
        campaign.id,
        'replied',
      ),
      skipped: await this.recipientsRepository.countByCampaignAndStatus(
        campaign.id,
        'skipped',
      ),
    };

    return {
      id: campaign.id,
      name: campaign.name,
      messageBody: campaign.messageBody,
      contactListId: campaign.contactListId,
      status: campaign.status,
      launchAt: campaign.launchAt?.toISOString() ?? null,
      timezone: campaign.timezone,
      transport: campaign.transport,
      senderConnectionIds: senders.map((row) => row.senderConnectionId),
      dailyBatchSize: campaign.dailyBatchSize,
      sendIntervalSeconds: campaign.sendIntervalSeconds,
      sendingWindowStartMinutes: campaign.sendingWindowStartMinutes,
      sendingWindowEndMinutes: campaign.sendingWindowEndMinutes,
      distributeRecipientsEqually: campaign.distributeRecipientsEqually,
      progress,
      createdAt: campaign.createdAt.toISOString(),
    };
  }

  private resolveSendingWindow(
    input: CreateWhatsappCampaignDto,
    launchAt: Date | null,
  ): {
    sendingWindowStartMinutes: number | null;
    sendingWindowEndMinutes: number | null;
  } {
    if (!launchAt) {
      return {
        sendingWindowStartMinutes: null,
        sendingWindowEndMinutes: null,
      };
    }

    const timezone = input.timezone?.trim();
    if (!timezone) {
      throw new BadRequestException(
        'Timezone is required when scheduling a campaign launch',
      );
    }

    if (input.sendingWindowEndMinutes == null) {
      throw new BadRequestException(
        'Sending window end time is required when launching a campaign',
      );
    }

    const sendingWindowStartMinutes =
      input.sendingWindowStartMinutes ??
      getMinutesFromMidnightInTimezone(launchAt, timezone);

    const sendingWindowEndMinutes = input.sendingWindowEndMinutes;

    if (sendingWindowStartMinutes >= sendingWindowEndMinutes) {
      throw new BadRequestException(
        'Sending window end must be after the start time',
      );
    }

    return {
      sendingWindowStartMinutes,
      sendingWindowEndMinutes,
    };
  }

  private validateDailyBatchAgainstSenderLimits(
    dailyBatchSize: number,
    senders: WhatsappSenderConnectionEntity[],
  ): void {
    const sendersWithLimit = senders.filter(
      (sender) => sender.dailySendLimit != null,
    );

    if (sendersWithLimit.length === 0) {
      return;
    }

    const totalLimit = sendersWithLimit.reduce(
      (sum, sender) => sum + (sender.dailySendLimit ?? 0),
      0,
    );

    if (dailyBatchSize > totalLimit) {
      throw new BadRequestException(
        `Daily send limit (${dailyBatchSize}) cannot exceed combined sender limits (${totalLimit})`,
      );
    }
  }
}
