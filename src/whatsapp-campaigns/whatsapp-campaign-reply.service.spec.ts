import { WhatsappCampaignRecipientEntity } from './entities/whatsapp-campaign-recipient.entity';
import { WhatsappCampaignReplyService } from './whatsapp-campaign-reply.service';
import type { WhatsappCampaignEventsRepository } from './whatsapp-campaign-events.repository';
import type { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';

describe('WhatsappCampaignReplyService', () => {
  const recipientsRepository = {
    findMostRecentSentForReply: jest.fn(),
    findById: jest.fn(),
    save: jest.fn(),
  } satisfies Pick<
    WhatsappCampaignRecipientsRepository,
    'findMostRecentSentForReply' | 'findById' | 'save'
  >;

  const eventsRepository = {
    createEvent: jest.fn(),
  } satisfies Pick<WhatsappCampaignEventsRepository, 'createEvent'>;

  const service = new WhatsappCampaignReplyService(
    recipientsRepository as WhatsappCampaignRecipientsRepository,
    eventsRepository as WhatsappCampaignEventsRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('marks recipient as replied and records event', async () => {
    const recipient = new WhatsappCampaignRecipientEntity();
    recipient.id = 'recipient-1';
    recipient.campaignId = 'campaign-1';
    recipient.status = 'sent';
    recipient.sentAt = new Date();

    recipientsRepository.findMostRecentSentForReply.mockResolvedValue(
      recipient,
    );
    recipientsRepository.findById.mockResolvedValue(recipient);
    recipientsRepository.save.mockImplementation((row) =>
      Promise.resolve(row as WhatsappCampaignRecipientEntity),
    );
    eventsRepository.createEvent.mockResolvedValue({});

    await service.handleInbound('sender-1', {
      from: '919876543210@c.us',
      body: 'Yes, interested',
      isGroup: false,
    });

    expect(
      recipientsRepository.findMostRecentSentForReply,
    ).toHaveBeenCalledWith('sender-1', '919876543210');
    expect(recipient.status).toBe('replied');
    expect(recipient.replyBody).toBe('Yes, interested');
    expect(eventsRepository.createEvent).toHaveBeenCalledWith({
      campaignId: 'campaign-1',
      recipientId: 'recipient-1',
      eventType: 'reply',
      metadata: { body: 'Yes, interested' },
    });
  });

  it('does nothing when no matching recipient', async () => {
    recipientsRepository.findMostRecentSentForReply.mockResolvedValue(null);

    await service.handleInbound('sender-1', {
      chatId: '919876543210@c.us',
      body: 'Hello',
    });

    expect(recipientsRepository.save).not.toHaveBeenCalled();
    expect(eventsRepository.createEvent).not.toHaveBeenCalled();
  });

  it('marks pending in-sequence recipient as replied', async () => {
    const recipient = new WhatsappCampaignRecipientEntity();
    recipient.id = 'recipient-2';
    recipient.campaignId = 'campaign-1';
    recipient.status = 'pending';
    recipient.sentAt = new Date();
    recipient.nextSendAt = new Date(Date.now() + 86_400_000);

    recipientsRepository.findMostRecentSentForReply.mockResolvedValue(
      recipient,
    );
    recipientsRepository.findById.mockResolvedValue(recipient);
    recipientsRepository.save.mockImplementation((row) =>
      Promise.resolve(row as WhatsappCampaignRecipientEntity),
    );
    eventsRepository.createEvent.mockResolvedValue({});

    await service.recordReplyForRecipient(recipient.id, 'Stop', new Date());

    expect(recipient.status).toBe('replied');
    expect(recipient.nextSendAt).toBeNull();
  });

  it('skips when recipient is already replied', async () => {
    const recipient = new WhatsappCampaignRecipientEntity();
    recipient.status = 'replied';
    recipientsRepository.findMostRecentSentForReply.mockResolvedValue(
      recipient,
    );

    await service.handleInbound('sender-1', {
      from: '919876543210@c.us',
      body: 'Again',
    });

    expect(recipientsRepository.save).not.toHaveBeenCalled();
  });
});
