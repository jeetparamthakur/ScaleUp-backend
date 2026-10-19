import type { WhatsappCampaignRecipientEntity } from '../entities/whatsapp-campaign-recipient.entity';

/**
 * Assigns each recipient to a sender in equal-sized contiguous chunks.
 */
export function assignRecipientsToSendersEqually(
  recipients: WhatsappCampaignRecipientEntity[],
  senderConnectionIds: string[],
): void {
  if (senderConnectionIds.length === 0 || recipients.length === 0) {
    return;
  }

  const count = recipients.length;
  const senderCount = senderConnectionIds.length;
  const base = Math.floor(count / senderCount);
  const remainder = count % senderCount;

  let index = 0;
  for (let senderIdx = 0; senderIdx < senderCount; senderIdx += 1) {
    const chunkSize = base + (senderIdx < remainder ? 1 : 0);
    const senderId = senderConnectionIds[senderIdx];

    for (let i = 0; i < chunkSize; i += 1) {
      recipients[index].senderConnectionId = senderId;
      index += 1;
    }
  }
}

/**
 * Assigns each new recipient to the sender with the fewest existing assignments.
 */
export function assignNewRecipientsToLeastLoadedSenders(
  newRecipients: WhatsappCampaignRecipientEntity[],
  senderConnectionIds: string[],
  existingCountBySender: Map<string, number>,
): void {
  if (senderConnectionIds.length === 0 || newRecipients.length === 0) {
    return;
  }

  const counts = new Map(existingCountBySender);

  for (const senderId of senderConnectionIds) {
    if (!counts.has(senderId)) {
      counts.set(senderId, 0);
    }
  }

  for (const recipient of newRecipients) {
    let chosenSender = senderConnectionIds[0];
    let minCount = counts.get(chosenSender) ?? 0;

    for (const senderId of senderConnectionIds) {
      const count = counts.get(senderId) ?? 0;
      if (count < minCount) {
        minCount = count;
        chosenSender = senderId;
      }
    }

    recipient.senderConnectionId = chosenSender;
    counts.set(chosenSender, minCount + 1);
  }
}
