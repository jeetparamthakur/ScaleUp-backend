import { WhatsappCampaignEntity } from './entities/whatsapp-campaign.entity';
import { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import { WhatsappCampaignSequenceStepEntity } from './entities/whatsapp-campaign-sequence-step.entity';
import { WhatsappCampaignSendService } from './whatsapp-campaign-send.service';
import type { WhatsappCampaignEventsRepository } from './whatsapp-campaign-events.repository';
import type { WhatsappCampaignMessagesRepository } from './whatsapp-campaign-messages.repository';
import type { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';
import type { WhatsappCampaignSequenceStepsRepository } from './whatsapp-campaign-sequence-steps.repository';
import type { WhatsappCampaignSendersRepository } from './whatsapp-campaign-senders.repository';
import type { WhatsappCampaignsRepository } from './whatsapp-campaigns.repository';
import type { OpenWaHttpClient } from '../inbox/whatsapp/openwa-http.client';
import type { PlatformOpenWaService } from '../inbox/whatsapp/platform-openwa.service';
import type { WhatsappSenderConnectionRepository } from '../whatsapp-sender-connections/whatsapp-sender-connection.repository';

function withSendingWindow(campaign: WhatsappCampaignEntity): void {
  campaign.timezone = 'UTC';
  campaign.sendingWindowStartMinutes = 9 * 60;
  campaign.sendingWindowEndMinutes = 17 * 60;
  campaign.launchAt = new Date('2026-01-01T00:00:00.000Z');
}

describe('WhatsappCampaignSendService', () => {
  const campaignsRepository = {
    save: jest.fn(),
  } satisfies Pick<WhatsappCampaignsRepository, 'save'>;

  const sendersRepository = {
    listByCampaign: jest.fn(),
  } satisfies Pick<WhatsappCampaignSendersRepository, 'listByCampaign'>;

  const recipientsRepository = {
    findNextDue: jest.fn(),
    save: jest.fn(),
    countByCampaignAndStatus: jest.fn(),
  } satisfies Pick<
    WhatsappCampaignRecipientsRepository,
    'findNextDue' | 'save' | 'countByCampaignAndStatus'
  >;

  const messagesRepository = {
    createMessage: jest.fn(),
  } satisfies Pick<WhatsappCampaignMessagesRepository, 'createMessage'>;

  const eventsRepository = {
    createEvent: jest.fn(),
  } satisfies Pick<WhatsappCampaignEventsRepository, 'createEvent'>;

  const senderConnectionRepository = {
    listReadyByIdsForOrg: jest.fn(),
    save: jest.fn(),
  } satisfies Pick<
    WhatsappSenderConnectionRepository,
    'listReadyByIdsForOrg' | 'save'
  >;

  const platformOpenWaService = {
    resolveCredentials: jest.fn(),
  } satisfies Pick<PlatformOpenWaService, 'resolveCredentials'>;

  const openWaClient = {
    sendText: jest.fn(),
  } satisfies Pick<OpenWaHttpClient, 'sendText'>;

  const sequenceStepsRepository = {
    listByCampaignId: jest.fn(),
  } satisfies Pick<WhatsappCampaignSequenceStepsRepository, 'listByCampaignId'>;

  const service = new WhatsappCampaignSendService(
    campaignsRepository as WhatsappCampaignsRepository,
    sendersRepository as WhatsappCampaignSendersRepository,
    recipientsRepository as WhatsappCampaignRecipientsRepository,
    messagesRepository as WhatsappCampaignMessagesRepository,
    eventsRepository as WhatsappCampaignEventsRepository,
    senderConnectionRepository as WhatsappSenderConnectionRepository,
    platformOpenWaService as PlatformOpenWaService,
    openWaClient as OpenWaHttpClient,
    sequenceStepsRepository as WhatsappCampaignSequenceStepsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('advances recipient to next step when sequence continues', async () => {
    const campaign = new WhatsappCampaignEntity();
    campaign.id = 'campaign-1';
    campaign.organizationId = 'org-1';
    campaign.status = 'sending';
    campaign.dailyBatchSize = 50;
    campaign.sendsTodayCount = 0;
    campaign.sendsTodayDate = null;
    campaign.sendIntervalSeconds = null;
    withSendingWindow(campaign);

    const step1 = new WhatsappCampaignSequenceStepEntity();
    step1.stepOrder = 1;
    step1.body = 'Hello';
    step1.delayMode = 'relative';
    step1.delayDays = 0;

    const step2 = new WhatsappCampaignSequenceStepEntity();
    step2.stepOrder = 2;
    step2.body = 'Follow up';
    step2.delayMode = 'relative';
    step2.delayDays = 1;

    const recipient = new WhatsappCampaignRecipientEntity();
    recipient.id = 'recipient-1';
    recipient.campaignId = 'campaign-1';
    recipient.phoneE164 = '+15551234567';
    recipient.status = 'pending';
    recipient.currentStepOrder = 1;
    recipient.nextSendAt = null;

    const sender = {
      id: 'sender-1',
      openwaSessionId: 'session-1',
      dailySendLimit: null,
      dailySendsUsed: 0,
      dailySendsDate: null,
    };

    sequenceStepsRepository.listByCampaignId.mockResolvedValue([step1, step2]);
    recipientsRepository.findNextDue.mockResolvedValue([recipient]);
    sendersRepository.listByCampaign.mockResolvedValue([
      { senderConnectionId: 'sender-1' },
    ]);
    senderConnectionRepository.listReadyByIdsForOrg.mockResolvedValue([sender]);
    platformOpenWaService.resolveCredentials.mockResolvedValue({
      baseUrl: 'http://openwa',
      apiKey: 'key',
    });
    openWaClient.sendText.mockResolvedValue({ messageId: 'msg-1' });
    recipientsRepository.save.mockImplementation((row) => Promise.resolve(row));
    campaignsRepository.save.mockImplementation((row) => Promise.resolve(row));
    senderConnectionRepository.save.mockImplementation((row) =>
      Promise.resolve(row),
    );
    messagesRepository.createMessage.mockResolvedValue({});
    eventsRepository.createEvent.mockResolvedValue({});
    recipientsRepository.countByCampaignAndStatus.mockResolvedValue(1);

    const now = new Date('2026-01-15T12:00:00.000Z');
    await service.processCampaign(campaign, now);

    expect(openWaClient.sendText).toHaveBeenCalledWith(
      'http://openwa',
      'key',
      'session-1',
      expect.any(String),
      'Hello',
    );
    expect(recipient.status).toBe('pending');
    expect(recipient.currentStepOrder).toBe(2);
    expect(recipient.nextSendAt).not.toBeNull();
    expect(recipient.sentAt).not.toBeNull();
  });

  it('marks recipient sent after final step', async () => {
    const campaign = new WhatsappCampaignEntity();
    campaign.id = 'campaign-1';
    campaign.organizationId = 'org-1';
    campaign.status = 'sending';
    campaign.dailyBatchSize = 50;
    campaign.sendsTodayCount = 0;
    campaign.sendsTodayDate = null;
    campaign.sendIntervalSeconds = null;
    withSendingWindow(campaign);

    const step1 = new WhatsappCampaignSequenceStepEntity();
    step1.stepOrder = 1;
    step1.body = 'Only';
    step1.delayMode = 'relative';
    step1.delayDays = 0;

    const recipient = new WhatsappCampaignRecipientEntity();
    recipient.id = 'recipient-1';
    recipient.campaignId = 'campaign-1';
    recipient.phoneE164 = '+15551234567';
    recipient.status = 'pending';
    recipient.currentStepOrder = 1;

    const sender = {
      id: 'sender-1',
      openwaSessionId: 'session-1',
      dailySendLimit: null,
      dailySendsUsed: 0,
      dailySendsDate: null,
    };

    sequenceStepsRepository.listByCampaignId.mockResolvedValue([step1]);
    recipientsRepository.findNextDue.mockResolvedValue([recipient]);
    sendersRepository.listByCampaign.mockResolvedValue([
      { senderConnectionId: 'sender-1' },
    ]);
    senderConnectionRepository.listReadyByIdsForOrg.mockResolvedValue([sender]);
    platformOpenWaService.resolveCredentials.mockResolvedValue({
      baseUrl: 'http://openwa',
      apiKey: 'key',
    });
    openWaClient.sendText.mockResolvedValue({ messageId: 'msg-1' });
    recipientsRepository.save.mockImplementation((row) => Promise.resolve(row));
    campaignsRepository.save.mockImplementation((row) => Promise.resolve(row));
    senderConnectionRepository.save.mockImplementation((row) =>
      Promise.resolve(row),
    );
    messagesRepository.createMessage.mockResolvedValue({});
    eventsRepository.createEvent.mockResolvedValue({});
    recipientsRepository.countByCampaignAndStatus.mockResolvedValue(0);

    await service.processCampaign(
      campaign,
      new Date('2026-01-15T12:00:00.000Z'),
    );

    expect(recipient.status).toBe('sent');
    expect(recipient.nextSendAt).toBeNull();
  });

  it('does not send when outside the daily sending window', async () => {
    const campaign = new WhatsappCampaignEntity();
    campaign.id = 'campaign-1';
    campaign.organizationId = 'org-1';
    campaign.status = 'scheduled';
    campaign.dailyBatchSize = 50;
    campaign.sendsTodayCount = 0;
    campaign.sendsTodayDate = null;
    campaign.sendIntervalSeconds = null;
    withSendingWindow(campaign);

    const step1 = new WhatsappCampaignSequenceStepEntity();
    step1.stepOrder = 1;
    step1.body = 'Hello';
    step1.delayMode = 'relative';
    step1.delayDays = 0;

    const recipient = new WhatsappCampaignRecipientEntity();
    recipient.id = 'recipient-1';
    recipient.campaignId = 'campaign-1';
    recipient.phoneE164 = '+15551234567';
    recipient.status = 'pending';
    recipient.currentStepOrder = 1;

    sequenceStepsRepository.listByCampaignId.mockResolvedValue([step1]);
    recipientsRepository.findNextDue.mockResolvedValue([recipient]);
    sendersRepository.listByCampaign.mockResolvedValue([
      { senderConnectionId: 'sender-1' },
    ]);
    campaignsRepository.save.mockImplementation((row) => Promise.resolve(row));

    const afterWindow = new Date('2026-01-15T20:00:00.000Z');
    await service.processCampaign(campaign, afterWindow);

    expect(openWaClient.sendText).not.toHaveBeenCalled();
    expect(campaign.nextSendEligibleAt?.toISOString()).toBe(
      '2026-01-16T09:00:00.000Z',
    );
  });
});
