import {
  Controller,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappSenderWebhookService } from './whatsapp-sender-webhook.service';

@Controller('webhooks/openwa/sender')
export class WhatsappSenderWebhookController {
  constructor(private readonly webhookService: WhatsappSenderWebhookService) {}

  @Post(':connectionId')
  @HttpCode(200)
  async handleWebhook(
    @Param('connectionId') connectionId: string,
    @Headers('x-openwa-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ ok: true }> {
    const rawBody =
      req.rawBody?.toString('utf8') ??
      (typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {}));

    const parsed = JSON.parse(rawBody) as {
      event: string;
      sessionId: string;
      data: Record<string, unknown>;
    };

    await this.webhookService.handleDelivery(
      connectionId,
      rawBody,
      signature,
      parsed,
    );

    return { ok: true };
  }
}
