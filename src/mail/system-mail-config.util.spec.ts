import { resolveSystemMailConfig } from './system-mail-config.util';

describe('resolveSystemMailConfig', () => {
  it('derives Gmail SMTP from GMAIL_USER and GMAIL_APP_PASSWORD', () => {
    const config = resolveSystemMailConfig({
      gmailUser: 'Me@Gmail.com',
      gmailAppPassword: 'abcd efgh ijkl mnop',
    });

    expect(config.smtp).toEqual(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        user: 'me@gmail.com',
        pass: 'abcdefghijklmnop',
        from: 'me@gmail.com',
        secure: false,
      }),
    );
    expect(config.smtpProfiles).toHaveLength(1);
    expect(config.preferSmtpOverResend).toBe(true);
    expect(config.useSmtp).toBe(true);
  });

  it('includes Gmail and explicit SMTP profiles when both are configured', () => {
    const config = resolveSystemMailConfig({
      gmailUser: 'me@gmail.com',
      gmailAppPassword: 'abcdefghijklmnop',
      smtpHost: 'smtp.example.com',
      smtpUser: 'sales@example.com',
      smtpPass: 'secret',
    });

    expect(config.smtpProfiles).toHaveLength(2);
    expect(config.smtpProfiles[0].host).toBe('smtp.gmail.com');
    expect(config.smtpProfiles[1].host).toBe('smtp.example.com');
    expect(config.preferSmtpOverResend).toBe(true);
  });

  it('honors SYSTEM_MAIL_SMTP_ORDER=smtp,gmail', () => {
    const config = resolveSystemMailConfig({
      gmailUser: 'me@gmail.com',
      gmailAppPassword: 'abcdefghijklmnop',
      smtpHost: 'smtp.example.com',
      smtpUser: 'sales@example.com',
      smtpPass: 'secret',
      smtpOrder: 'smtp,gmail',
    });

    expect(config.smtp.host).toBe('smtp.example.com');
    expect(config.smtpProfiles[0].host).toBe('smtp.example.com');
    expect(config.smtpProfiles[1].host).toBe('smtp.gmail.com');
  });

  it('uses GMAIL_FROM when provided for Gmail', () => {
    const config = resolveSystemMailConfig({
      gmailUser: 'me@gmail.com',
      gmailAppPassword: 'abcdefghijklmnop',
      gmailFrom: 'Markos <me@gmail.com>',
    });

    expect(config.smtp.from).toBe('Markos <me@gmail.com>');
  });
});
