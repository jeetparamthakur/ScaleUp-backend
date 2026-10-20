import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import {
  isLocalTrackingHostname,
  parseTrackingBaseUrl,
  verifyTrackingOpenEndpoint,
} from './email-campaigns/tracking-config.util';
import {
  isOpenWaWebhookBaseUrlPubliclyReachable,
  OPENWA_WEBHOOK_LOCAL_DEV_HINT,
} from './inbox/whatsapp/utils/openwa-webhook-config.util';
import { PlatformOpenWaService } from './inbox/whatsapp/platform-openwa.service';

function warnIfTrackingUrlMisconfigured(trackingBaseUrl: string): void {
  const logger = new Logger('TrackingConfig');
  const parsed = parseTrackingBaseUrl(trackingBaseUrl);

  if (!parsed) {
    logger.warn(
      `TRACKING_BASE_URL "${trackingBaseUrl}" is not a valid URL — open/click tracking in campaign emails will fail`,
    );
    return;
  }

  if (isLocalTrackingHostname(parsed.hostname)) {
    logger.warn(
      `TRACKING_BASE_URL points to ${parsed.hostname} — external mail servers cannot load tracking pixels. ` +
        'Expose port 3008 via ngrok or localtunnel and set TRACKING_BASE_URL to the public URL.',
    );
  }
}

async function warnIfTrackingOpenEndpointUnreachable(
  trackingBaseUrl: string,
): Promise<void> {
  const logger = new Logger('TrackingConfig');
  const parsed = parseTrackingBaseUrl(trackingBaseUrl);

  if (!parsed) {
    return;
  }

  if (isLocalTrackingHostname(parsed.hostname)) {
    const verified = await verifyTrackingOpenEndpoint(trackingBaseUrl);
    if (verified) {
      logger.log(
        `TRACKING_BASE_URL open endpoint verified at ${trackingBaseUrl}`,
      );
    } else {
      logger.warn(
        `TRACKING_BASE_URL open endpoint probe failed for ${trackingBaseUrl} — open/click tracking may fail`,
      );
    }
    return;
  }

  const verified = await verifyTrackingOpenEndpoint(trackingBaseUrl);
  if (verified) {
    logger.log(
      `TRACKING_BASE_URL open endpoint verified at ${trackingBaseUrl}`,
    );
    return;
  }

  logger.warn(
    `TRACKING_BASE_URL open endpoint probe failed for ${trackingBaseUrl} — external mail servers cannot load tracking pixels. ` +
      'Use your direct API host (https://api.example.com) or frontend proxy with /api (https://app.example.com/api).',
  );
}

function warnIfOpenWaWebhookBaseIsLocal(webhookBaseUrl: string): void {
  const logger = new Logger('OpenWaWebhookConfig');
  if (isOpenWaWebhookBaseUrlPubliclyReachable(webhookBaseUrl)) {
    return;
  }

  logger.warn(
    `OpenWA webhook callbacks use ${webhookBaseUrl} — the OpenWA server must be able to reach that host. ` +
      OPENWA_WEBHOOK_LOCAL_DEV_HINT,
  );
}

/** OpenWA may POST up to ~1 MiB JSON (inline media capped in OpenWA). Express default is 100kb → HTTP 413. */
const OPENWA_WEBHOOK_JSON_BODY_LIMIT = '2mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: OPENWA_WEBHOOK_JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', {
    limit: OPENWA_WEBHOOK_JSON_BODY_LIMIT,
    extended: true,
  });
  const config = app.get(ConfigService);
  const trackingBaseUrl = config.get<string>(
    'trackingBaseUrl',
    'http://localhost:3008',
  );
  warnIfTrackingUrlMisconfigured(trackingBaseUrl);
  warnIfOpenWaWebhookBaseIsLocal(
    app.get(PlatformOpenWaService).resolveWebhookBaseUrl(),
  );

  app.use(
    helmet({
      // Email clients load tracking pixels cross-origin; same-origin blocks opens.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('frontendUrl'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const port = config.get<number>('port') ?? 3008;
  await app.listen(port, '0.0.0.0');
  const rssMiB = Math.round(process.memoryUsage().rss / (1024 * 1024));
  new Logger('Bootstrap').log(
    `Listening on 0.0.0.0:${port} (rss=${rssMiB}MiB)`,
  );
  await warnIfTrackingOpenEndpointUnreachable(trackingBaseUrl);
}
void bootstrap();
