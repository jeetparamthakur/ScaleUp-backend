import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as nodemailer from 'nodemailer';
import { isHostedRuntime } from '../common/hosted-runtime.util';
import { MailService } from './mail.service';

jest.mock('../common/hosted-runtime.util', () => ({
  isHostedRuntime: jest.fn(() => false),
}));

const isHostedRuntimeMock = isHostedRuntime as jest.MockedFunction<
  typeof isHostedRuntime
>;

const resendSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: resendSend },
  })),
}));

const smtpSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: smtpSendMail,
  })),
}));

describe('MailService', () => {
  let service: MailService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    isHostedRuntimeMock.mockReturnValue(false);
    resendSend.mockReset();
    smtpSendMail.mockReset();
    (nodemailer.createTransport as jest.Mock).mockClear();
    smtpSendMail.mockResolvedValue({ messageId: 'smtp-1' });

    config = {
      get: jest.fn((key: string) => {
        if (key === 'resend.apiKey') {
          return 're_test_key';
        }
        if (key === 'resend.from') {
          return 'onboarding@resend.dev';
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService, { provide: ConfigService, useValue: config }],
    }).compile();

    service = module.get(MailService);
  });

  it('sends OTP mail through Resend when RESEND_API_KEY is set', async () => {
    resendSend.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await service.sendOtpEmail('user@example.com', '123456');

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'onboarding@resend.dev',
        to: 'user@example.com',
        subject: 'Your Markos verification code',
      }),
    );
    expect(smtpSendMail).not.toHaveBeenCalled();
  });

  it('maps Resend API errors to a 500', async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: { message: 'You can only send testing emails to your own email' },
    });

    await expect(
      service.sendOtpEmail('other@example.com', '123456'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('requires SMTP when Resend is not configured', async () => {
    config.get.mockImplementation(() => undefined);

    await expect(
      service.sendOtpEmail('user@example.com', '123456'),
    ).rejects.toMatchObject({
      message: 'Email service is not configured. Contact platform support.',
    });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it('prefers SMTP over Resend when Gmail system mail is configured', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'resend.apiKey') {
        return 're_test_key';
      }
      if (key === 'systemMail.useSmtp') {
        return true;
      }
      if (key === 'systemMail.preferSmtpOverResend') {
        return true;
      }
      if (key === 'systemMail.smtpProfiles') {
        return [
          {
            host: 'smtp.gmail.com',
            port: 587,
            user: 'me@gmail.com',
            pass: 'abcdefghijklmnop',
            from: 'me@gmail.com',
            secure: false,
          },
        ];
      }
      return undefined;
    });

    await service.sendOtpEmail('user@example.com', '123456');

    expect(resendSend).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        requireTLS: true,
        auth: { user: 'me@gmail.com', pass: 'abcdefghijklmnop' },
      }),
    );
    expect(smtpSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'me@gmail.com',
        to: 'user@example.com',
        subject: 'Your Markos verification code',
      }),
    );
  });

  it('sends via SMTP when only SMTP is configured', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'systemMail.useSmtp') {
        return true;
      }
      if (key === 'systemMail.preferSmtpOverResend') {
        return false;
      }
      if (key === 'systemMail.smtpProfiles') {
        return [
          {
            host: 'smtp.example.com',
            port: 587,
            user: 'noreply@example.com',
            pass: 'secret',
            from: 'noreply@example.com',
            secure: false,
          },
        ];
      }
      return undefined;
    });

    await service.sendOtpEmail('user@example.com', '654321');

    expect(resendSend).not.toHaveBeenCalled();
    expect(smtpSendMail).toHaveBeenCalled();
  });

  it('falls back to the next SMTP profile when the first send fails', async () => {
    config.get.mockImplementation((key: string) => {
      if (key === 'systemMail.useSmtp') {
        return true;
      }
      if (key === 'systemMail.preferSmtpOverResend') {
        return true;
      }
      if (key === 'systemMail.smtpProfiles') {
        return [
          {
            host: 'smtp.gmail.com',
            port: 587,
            user: 'me@gmail.com',
            pass: 'bad',
            from: 'me@gmail.com',
            secure: false,
          },
          {
            host: 'smtp.example.com',
            port: 587,
            user: 'noreply@example.com',
            pass: 'secret',
            from: 'noreply@example.com',
            secure: false,
          },
        ];
      }
      return undefined;
    });

    smtpSendMail
      .mockRejectedValueOnce(new Error('auth failed'))
      .mockResolvedValueOnce({ messageId: 'smtp-2' });

    await service.sendOtpEmail('user@example.com', '111111');

    expect(smtpSendMail).toHaveBeenCalledTimes(2);
  });

  it('on hosted runtime uses Gmail API instead of SMTP when OAuth refresh is configured', async () => {
    isHostedRuntimeMock.mockReturnValue(true);
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;

    config.get.mockImplementation((key: string) => {
      if (key === 'systemMail.useSmtp') {
        return true;
      }
      if (key === 'systemMail.preferSmtpOverResend') {
        return true;
      }
      if (key === 'systemMail.smtpProfiles') {
        return [
          {
            host: 'smtp.gmail.com',
            port: 587,
            user: 'me@gmail.com',
            pass: 'abcdefghijklmnop',
            from: 'me@gmail.com',
            secure: false,
          },
        ];
      }
      if (key === 'systemMail.gmailOAuthRefreshToken') {
        return 'refresh-token';
      }
      if (key === 'oauth.google.clientId') {
        return 'client-id';
      }
      if (key === 'oauth.google.clientSecret') {
        return 'client-secret';
      }
      return undefined;
    });

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ access_token: 'access-token' }),
      })
      .mockResolvedValueOnce({ ok: true });

    await service.sendOtpEmail('user@example.com', '123456');

    expect(smtpSendMail).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.any(Object),
    );
  });

  it('on hosted runtime fails fast when only Gmail app password SMTP is configured', async () => {
    isHostedRuntimeMock.mockReturnValue(true);
    config.get.mockImplementation((key: string) => {
      if (key === 'systemMail.useSmtp') {
        return true;
      }
      if (key === 'systemMail.preferSmtpOverResend') {
        return true;
      }
      if (key === 'systemMail.smtpProfiles') {
        return [
          {
            host: 'smtp.gmail.com',
            port: 587,
            user: 'me@gmail.com',
            pass: 'abcdefghijklmnop',
            from: 'me@gmail.com',
            secure: false,
          },
        ];
      }
      return undefined;
    });

    await expect(
      service.sendOtpEmail('user@example.com', '123456'),
    ).rejects.toThrow(/Gmail app-password SMTP is blocked/);
    expect(smtpSendMail).not.toHaveBeenCalled();
  });
});
