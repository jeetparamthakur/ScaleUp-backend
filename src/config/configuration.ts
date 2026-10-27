import { isHostedRuntime } from '../common/hosted-runtime.util';
import { resolveEffectiveTrackingBaseUrl } from '../email-campaigns/tracking-config.util';
import { resolveSystemMailConfig } from '../mail/system-mail-config.util';

const LOCAL_DATABASE_URL = 'postgresql://markos:markos@localhost:5435/markos';

export default () => {
  const systemMail = resolveSystemMailConfig({
    gmailUser: process.env.GMAIL_USER,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
    gmailFrom: process.env.GMAIL_FROM,
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT,
    smtpUser: process.env.SMTP_USER,
    smtpPass: process.env.SMTP_PASS,
    smtpPassword: process.env.SMTP_PASSWORD,
    smtpFrom: process.env.SMTP_FROM,
    emailFrom: process.env.EMAIL_FROM,
    smtpSecure: process.env.SMTP_SECURE,
    smtpOrder: process.env.SYSTEM_MAIL_SMTP_ORDER,
  });

  return {
    port: parseInt(process.env.PORT ?? '3008', 10),
    frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3007',
    databaseUrl: isHostedRuntime()
      ? (process.env.DATABASE_URL ?? '')
      : (process.env.DATABASE_URL ?? LOCAL_DATABASE_URL),
    jwt: {
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    },
    bcrypt: {
      rounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
    },
    smtp: systemMail.smtp,
    systemMail: {
      useSmtp: systemMail.useSmtp,
      preferSmtpOverResend: systemMail.preferSmtpOverResend,
      smtpProfiles: systemMail.smtpProfiles,
      gmailOAuthRefreshToken: process.env.GMAIL_OAUTH_REFRESH_TOKEN ?? '',
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY ?? '',
      from: process.env.RESEND_FROM ?? 'onboarding@resend.dev',
    },
    backendUrl: process.env.BACKEND_URL ?? '',
    openwaWebhookBaseUrl: process.env.OPENWA_WEBHOOK_BASE_URL ?? '',
    websiteOAuthCallbackBaseUrl:
      process.env.WEBSITE_OAUTH_CALLBACK_BASE_URL ?? '',
    emailAttachmentsDir: process.env.EMAIL_ATTACHMENTS_DIR ?? '',
    allowLocalTracking: process.env.ALLOW_LOCAL_TRACKING === 'true',
    trackingBaseUrl: resolveEffectiveTrackingBaseUrl({
      trackingBaseUrl: process.env.TRACKING_BASE_URL,
      frontendUrl: process.env.FRONTEND_URL,
      backendUrl: process.env.BACKEND_URL,
    }),
    trackingHmacSecret:
      process.env.TRACKING_HMAC_SECRET?.trim() ||
      process.env.JWT_SECRET?.trim() ||
      'dev-secret-change-me',
    replyPollIntervalCron:
      process.env.REPLY_POLL_INTERVAL_CRON ?? '*/2 * * * *',
    bouncePollIntervalCron:
      process.env.BOUNCE_POLL_INTERVAL_CRON ?? '*/2 * * * *',
    credentials: {
      encryptionKey:
        process.env.CREDENTIALS_ENCRYPTION_KEY ??
        'dev-credentials-key-change-me-in-production',
    },
    oauth: {
      google: {
        clientId: process.env.GOOGLE_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? '',
      },
      microsoft: {
        clientId: process.env.MICROSOFT_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.MICROSOFT_OAUTH_CLIENT_SECRET ?? '',
      },
      zoom: {
        clientId: process.env.ZOOM_OAUTH_CLIENT_ID ?? '',
        clientSecret: process.env.ZOOM_OAUTH_CLIENT_SECRET ?? '',
      },
    },
    location: {
      geonamesUsername: process.env.GEONAMES_USERNAME ?? '',
    },
  };
};
