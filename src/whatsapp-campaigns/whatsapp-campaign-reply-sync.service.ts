import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OpenWaHttpClient } from '../inbox/whatsapp/openwa-http.client';
import {
  isOpenWaRateLimitError,
  isOpenWaTransientGatewayError,
} from '../inbox/whatsapp/utils/openwa-http-error.util';
import { runOpenWaSessionMediaTask } from '../inbox/whatsapp/utils/openwa-session-media-queue.util';
import { PlatformOpenWaService } from '../inbox/whatsapp/platform-openwa.service';
import { whatsappPhoneDigits } from '../whatsapp-contact-lists/utils/normalize-whatsapp-phone.util';
import { WhatsappSenderConnectionRepository } from '../whatsapp-sender-connections/whatsapp-sender-connection.repository';
import { phoneToOpenWaChatId } from './utils/phone-to-openwa-chat-id.util';
import { WhatsappCampaignRecipientsRepository } from './whatsapp-campaign-recipients.repository';
import { WhatsappCampaignReplyService } from './whatsapp-campaign-reply.service';

const RECIPIENTS_PER_TICK = 10;

@Injectable()
export class WhatsappCampaignReplySyncService {
  private readonly logger = new Logger(WhatsappCampaignReplySyncService.name);
  private isProcessing = false;

  constructor(
    private readonly recipientsRepository: WhatsappCampaignRecipientsRepository,
    private readonly senderConnectionRepository: WhatsappSenderConnectionRepository,
    private readonly replyService: WhatsappCampaignReplyService,
    private readonly platformOpenWaService: PlatformOpenWaService,
    private readonly openWaClient: OpenWaHttpClient,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async pollForReplies(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const recipients =
        await this.recipientsRepository.findSentForReplySync(
          RECIPIENTS_PER_TICK,
        );

      if (recipients.length === 0) {
        return;
      }

      const { baseUrl, apiKey } =
        await this.platformOpenWaService.resolveCredentials();

      let stopTickForRateLimit = false;

      for (const recipient of recipients) {
        if (stopTickForRateLimit) {
          break;
        }

        if (!recipient.senderConnectionId || !recipient.sentAt) {
          continue;
        }

        const sender = await this.senderConnectionRepository.findById(
          recipient.senderConnectionId,
        );
        if (!sender?.openwaSessionId) {
          continue;
        }

        const chatIds = this.buildChatIdCandidates(recipient.phoneE164);
        const sentAfterMs = recipient.sentAt.getTime();
        const sessionId = sender.openwaSessionId;

        for (const chatId of chatIds) {
          try {
            const history = await runOpenWaSessionMediaTask(sessionId, () =>
              this.openWaClient.getChatHistory(
                baseUrl,
                apiKey,
                sessionId,
                chatId,
                { limit: 80, deep: true, includeMedia: false },
              ),
            );

            const inbound = history
              .filter(
                (message) =>
                  !message.fromMe && message.timestamp * 1000 > sentAfterMs,
              )
              .sort((a, b) => b.timestamp - a.timestamp);

            if (inbound.length === 0) {
              continue;
            }

            const latest = inbound[0];
            await this.replyService.recordReplyForRecipient(
              recipient.id,
              latest.body,
              new Date(latest.timestamp * 1000),
            );
            break;
          } catch (error) {
            if (isOpenWaRateLimitError(error)) {
              this.logger.debug(
                `Reply sync pausing tick after rate limit (recipient ${recipient.id})`,
              );
              stopTickForRateLimit = true;
              break;
            }
            if (isOpenWaTransientGatewayError(error)) {
              this.logger.debug(
                `Reply sync skipped chat ${chatId} for recipient ${recipient.id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              continue;
            }
            this.logger.debug(
              `Reply sync skipped chat ${chatId} for recipient ${recipient.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }
    } catch (error) {
      this.logger.error(
        'WhatsApp campaign reply sync failed',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private buildChatIdCandidates(phoneE164: string): string[] {
    const digits = whatsappPhoneDigits(phoneE164);
    const candidates = new Set<string>();

    try {
      candidates.add(phoneToOpenWaChatId(phoneE164));
    } catch {
      // ignore invalid stored phone
    }

    if (digits) {
      candidates.add(`${digits}@c.us`);
      if (digits.length === 10) {
        candidates.add(`91${digits}@c.us`);
      }
    }

    return [...candidates];
  }
}
