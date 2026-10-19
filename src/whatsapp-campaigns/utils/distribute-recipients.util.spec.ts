import { WhatsappCampaignRecipientEntity } from '../entities/whatsapp-campaign-recipient.entity';
import { assignRecipientsToSendersEqually } from './distribute-recipients.util';

function buildRecipients(count: number): WhatsappCampaignRecipientEntity[] {
  return Array.from({ length: count }, () => {
    const row = new WhatsappCampaignRecipientEntity();
    row.senderConnectionId = null;
    return row;
  });
}

describe('assignRecipientsToSendersEqually', () => {
  it('splits recipients across senders with remainder on first senders', () => {
    const recipients = buildRecipients(5);
    assignRecipientsToSendersEqually(recipients, ['a', 'b']);

    expect(recipients.map((row) => row.senderConnectionId)).toEqual([
      'a',
      'a',
      'a',
      'b',
      'b',
    ]);
  });
});
