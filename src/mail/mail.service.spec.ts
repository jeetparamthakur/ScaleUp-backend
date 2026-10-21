import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';

const send = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send },
  })),
}));

describe('MailService', () => {
  let service: MailService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    send.mockReset();
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
    send.mockResolvedValue({ data: { id: 'email_1' }, error: null });

    await service.sendOtpEmail('user@example.com', '123456');

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'onboarding@resend.dev',
        to: 'user@example.com',
        subject: 'Your Markos verification code',
      }),
    );
  });

  it('maps Resend API errors to a 500', async () => {
    send.mockResolvedValue({
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
    expect(send).not.toHaveBeenCalled();
  });
});
