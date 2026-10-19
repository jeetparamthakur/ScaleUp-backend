import { BadRequestException } from '@nestjs/common';
import { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import type { WhatsappCampaignEntity } from './entities/whatsapp-campaign.entity';
import { WhatsappCampaignsService } from './whatsapp-campaigns.service';

describe('WhatsappCampaignsService addRecipients', () => {
  const campaignId = 'campaign-1';
  const organizationId = 'org-1';
  const contactListId = 'list-1';
  const user = { id: 'user-1' } as never;

  const sendingCampaign = {
    id: campaignId,
    organizationId,
    contactListId,
    status: 'sending' as const,
    distributeRecipientsEqually: false,
  } satisfies Pick<
    WhatsappCampaignEntity,
    | 'id'
    | 'organizationId'
    | 'contactListId'
    | 'status'
    | 'distributeRecipientsEqually'
  >;

  function createService(options?: {
    campaign?: typeof sendingCampaign;
    existingPhones?: string[];
    listMembers?: Array<{
      id: string;
      listId: string;
      phone: string;
    }>;
  }) {
    const campaign = options?.campaign ?? sendingCampaign;

    const campaignsRepository = {
      findByIdForOrg: jest
        .fn<Promise<typeof campaign | null>, [string, string]>()
        .mockResolvedValue(campaign),
    };

    const recipientsRepository = {
      findPhonesAlreadyOnCampaign: jest
        .fn<Promise<Set<string>>, [string, string[]]>()
        .mockImplementation((_campaignId, phones) =>
          Promise.resolve(
            new Set(
              (options?.existingPhones ?? []).filter((phone) =>
                phones.some(
                  (candidate) =>
                    candidate.replace(/\D/g, '') === phone.replace(/\D/g, ''),
                ),
              ),
            ),
          ),
        ),
      countBySenderForCampaign: jest
        .fn<Promise<Map<string, number>>, [string]>()
        .mockResolvedValue(new Map()),
      saveMany: jest
        .fn<
          Promise<WhatsappCampaignRecipientEntity[]>,
          [WhatsappCampaignRecipientEntity[]]
        >()
        .mockImplementation((rows) =>
          Promise.resolve(
            rows.map((row, index) => ({
              ...row,
              id: `recipient-${index + 1}`,
              createdAt: new Date('2026-08-19T10:00:00Z'),
            })) as WhatsappCampaignRecipientEntity[],
          ),
        ),
    };

    const listMembersRepository = {
      findByIds: jest.fn().mockResolvedValue(options?.listMembers ?? []),
      findByListIdAndPhone: jest.fn().mockResolvedValue(null),
    };

    const contactListsService = {
      addMember: jest.fn().mockResolvedValue({}),
      appendProspectsAndResolveMembers: jest.fn().mockResolvedValue([]),
    };

    const recipientMapper = {
      toRecipientResponse: jest
        .fn<
          {
            id: string;
            phoneE164: string;
            status: string;
            createdAt: string;
          },
          [WhatsappCampaignRecipientEntity, null]
        >()
        .mockImplementation((recipient) => ({
          id: recipient.id,
          phoneE164: recipient.phoneE164,
          status: recipient.status,
          firstName: null,
          lastName: null,
          company: null,
          sentAt: null,
          repliedAt: null,
          replyBody: null,
          lastError: null,
          createdAt: recipient.createdAt.toISOString(),
        })),
      buildMemberMap: jest.fn().mockReturnValue(new Map()),
    };

    const service = new WhatsappCampaignsService(
      campaignsRepository as never,
      { listByCampaign: jest.fn().mockResolvedValue([]) } as never,
      recipientsRepository as never,
      { findByIdAndOrganizationId: jest.fn() } as never,
      contactListsService as never,
      listMembersRepository as never,
      { findByIdForUser: jest.fn() } as never,
      recipientMapper as never,
      { listByCampaignId: jest.fn() } as never,
    );

    return {
      service,
      recipientsRepository,
      contactListsService,
      listMembersRepository,
    };
  }

  it('adds list members starting at step 1 for a sending campaign', async () => {
    const { service, recipientsRepository } = createService({
      listMembers: [
        { id: 'member-1', listId: contactListId, phone: '+15551234567' },
      ],
    });

    const result = await service.addRecipients(
      organizationId,
      campaignId,
      user,
      { listMemberIds: ['member-1'] },
    );

    expect(recipientsRepository.saveMany).toHaveBeenCalledWith([
      expect.objectContaining({
        phoneE164: '+15551234567',
        currentStepOrder: 1,
        status: 'pending',
        listMemberId: 'member-1',
        nextSendAt: null,
      }),
    ]);
    expect(result.addedCount).toBe(1);
  });

  it('allows adding to a scheduled campaign', async () => {
    const { service } = createService({
      campaign: { ...sendingCampaign, status: 'scheduled' },
      listMembers: [
        { id: 'member-1', listId: contactListId, phone: '+15551234567' },
      ],
    });

    const result = await service.addRecipients(
      organizationId,
      campaignId,
      user,
      { listMemberIds: ['member-1'] },
    );

    expect(result.addedCount).toBe(1);
  });

  it('rejects adding to a completed campaign', async () => {
    const { service } = createService({
      campaign: { ...sendingCampaign, status: 'completed' },
    });

    await expect(
      service.addRecipients(organizationId, campaignId, user, {
        listMemberIds: ['member-1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when all contacts are already on the campaign', async () => {
    const { service } = createService({
      listMembers: [
        { id: 'member-1', listId: contactListId, phone: '+15551234567' },
      ],
      existingPhones: ['+15551234567'],
    });

    await expect(
      service.addRecipients(organizationId, campaignId, user, {
        listMemberIds: ['member-1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects list members from another list', async () => {
    const { service } = createService({
      listMembers: [
        { id: 'member-1', listId: 'other-list', phone: '+15551234567' },
      ],
    });

    await expect(
      service.addRecipients(organizationId, campaignId, user, {
        listMemberIds: ['member-1'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('calls CRM append when prospectIds are provided', async () => {
    const { service, contactListsService } = createService();

    contactListsService.appendProspectsAndResolveMembers.mockResolvedValue([
      {
        id: 'member-2',
        listId: contactListId,
        phone: '+15559876543',
      },
    ]);

    await service.addRecipients(organizationId, campaignId, user, {
      prospectIds: ['prospect-1'],
    });

    expect(
      contactListsService.appendProspectsAndResolveMembers,
    ).toHaveBeenCalledWith(contactListId, ['prospect-1'], organizationId, user);
  });
});
