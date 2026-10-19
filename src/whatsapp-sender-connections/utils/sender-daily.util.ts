import type { WhatsappSenderConnectionEntity } from '../entities/whatsapp-sender-connection.entity';
import { getUtcCalendarDateKey } from '../../mailboxes/mailbox-daily.util';

export function applySenderDailyReset(
  sender: WhatsappSenderConnectionEntity,
  now: Date,
): void {
  const todayKey = getUtcCalendarDateKey(now);

  if (sender.sendsTodayDate !== todayKey) {
    sender.sendsTodayDate = todayKey;
    sender.sendsTodayCount = 0;
  }
}

export function getSenderRemainingDailyCapacity(
  sender: WhatsappSenderConnectionEntity,
  now: Date,
): number | null {
  if (sender.dailySendLimit == null) {
    return null;
  }

  applySenderDailyReset(sender, now);
  return Math.max(0, sender.dailySendLimit - sender.sendsTodayCount);
}

export function incrementSenderDailySendCount(
  sender: WhatsappSenderConnectionEntity,
  now: Date,
): void {
  applySenderDailyReset(sender, now);
  sender.sendsTodayCount += 1;
}
