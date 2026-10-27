import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';
import { isHostedRuntime } from '../common/hosted-runtime.util';
import {
  buildGmailRawMessage,
  refreshGoogleAccessToken,
  sendGmailApiMessage,
} from './gmail-system-mail.send';
import type { SystemSmtpConfig } from './system-mail-config.util';

export interface InviteEmailPayload {
  to: string;
  inviteUrl: string;
  roleName: string;
  hierarchyLevel: number;
  invitedByEmail: string;
}

interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly transporters = new Map<string, Transporter>();
  private resend: Resend | null = null;

  constructor(private readonly config: ConfigService) {}

  async sendOtpEmail(to: string, code: string): Promise<void> {
    await this.sendEmail({
      to,
      subject: 'Your Markos verification code',
      text: [
        'Your Markos verification code is:',
        '',
        code,
        '',
        'This code expires in 10 minutes.',
        'If you did not request this, you can ignore this email.',
      ].join('\n'),
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
          <p style="font-size: 16px; margin-bottom: 24px;">Your Markos verification code is:</p>
          <p style="font-size: 32px; font-weight: 700; letter-spacing: 0.35em; margin: 0 0 24px;">${code}</p>
          <p style="font-size: 14px; color: #475569; margin: 0;">This code expires in 10 minutes. If you did not request this, you can ignore this email.</p>
        </div>
      `,
    });
  }

  async sendInviteEmail(payload: InviteEmailPayload): Promise<void> {
    await this.sendEmail({
      to: payload.to,
      subject: 'You have been invited to join a Markos workspace',
      text: [
        `${payload.invitedByEmail} invited you to join their Markos workspace.`,
        '',
        `Role: ${payload.roleName}`,
        `Hierarchy level: ${payload.hierarchyLevel}`,
        '',
        `Accept your invitation: ${payload.inviteUrl}`,
      ].join('\n'),
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
          <p style="font-size: 16px;">${payload.invitedByEmail} invited you to join their Markos workspace.</p>
          <p style="font-size: 14px; color: #475569;">Role: ${payload.roleName} · Level ${payload.hierarchyLevel}</p>
          <p style="margin-top: 24px;"><a href="${payload.inviteUrl}" style="color: #4338CA; font-weight: 600;">Accept invitation</a></p>
        </div>
      `,
    });
  }

  private async sendEmail(message: OutboundEmail): Promise<void> {
    if (this.shouldSendViaGmailApi()) {
      await this.sendViaGmailApi(message);
      return;
    }

    if (this.isHostedGmailAppPasswordOnly()) {
      const resend = this.getResend();
      if (resend) {
        await this.sendViaResend(resend, message);
        return;
      }

      throw new InternalServerErrorException(
        'Gmail app-password SMTP is blocked on cloud hosts (e.g. Render). Add GMAIL_OAUTH_REFRESH_TOKEN with GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET, or set RESEND_API_KEY.',
      );
    }

    if (this.shouldSendViaSmtpFirst()) {
      await this.sendViaSmtp(message);
      return;
    }

    const resend = this.getResend();
    if (resend) {
      await this.sendViaResend(resend, message);
      return;
    }

    await this.sendViaSmtp(message);
  }

  private shouldSendViaGmailApi(): boolean {
    if (!isHostedRuntime()) {
      return false;
    }

    return this.canSendViaGmailApi();
  }

  private isHostedGmailAppPasswordOnly(): boolean {
    if (!isHostedRuntime()) {
      return false;
    }

    const useSmtp = this.config.get<boolean>('systemMail.useSmtp') ?? false;
    if (!useSmtp) {
      return false;
    }

    return !this.canSendViaGmailApi();
  }

  private canSendViaGmailApi(): boolean {
    const refreshToken = this.config
      .get<string>('systemMail.gmailOAuthRefreshToken')
      ?.trim();
    const clientId = this.config.get<string>('oauth.google.clientId')?.trim();
    const clientSecret = this.config
      .get<string>('oauth.google.clientSecret')
      ?.trim();
    const from = this.resolveGmailFromAddress();

    return Boolean(refreshToken && clientId && clientSecret && from);
  }

  private resolveGmailFromAddress(): string | null {
    const profiles = this.getSmtpProfiles();
    const gmailProfile = profiles.find(
      (profile) => profile.host === 'smtp.gmail.com' && profile.from,
    );
    return gmailProfile?.from?.trim() ?? null;
  }

  private async sendViaGmailApi(message: OutboundEmail): Promise<void> {
    const from = this.resolveGmailFromAddress();
    const refreshToken = this.config
      .get<string>('systemMail.gmailOAuthRefreshToken')
      ?.trim();
    const clientId = this.config.get<string>('oauth.google.clientId')?.trim();
    const clientSecret = this.config
      .get<string>('oauth.google.clientSecret')
      ?.trim();

    if (!from || !refreshToken || !clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Gmail API mail is not fully configured. Contact platform support.',
      );
    }

    try {
      const accessToken = await refreshGoogleAccessToken({
        clientId,
        clientSecret,
        refreshToken,
      });
      const rawMessage = buildGmailRawMessage({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
      await sendGmailApiMessage({ accessToken, rawMessage });
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to send email via Gmail API. Contact platform support.',
      );
    }
  }

  private shouldSendViaSmtpFirst(): boolean {
    const useSmtp = this.config.get<boolean>('systemMail.useSmtp') ?? false;
    if (!useSmtp) {
      return false;
    }

    const preferSmtp =
      this.config.get<boolean>('systemMail.preferSmtpOverResend') ?? false;
    if (preferSmtp) {
      return true;
    }

    return !this.getResend();
  }

  private getResend(): Resend | null {
    const apiKey = this.config.get<string>('resend.apiKey')?.trim();
    if (!apiKey) {
      return null;
    }

    if (!this.resend) {
      this.resend = new Resend(apiKey);
    }

    return this.resend;
  }

  private async sendViaResend(
    resend: Resend,
    message: OutboundEmail,
  ): Promise<void> {
    const from =
      this.config.get<string>('resend.from')?.trim() || 'onboarding@resend.dev';

    try {
      const { error } = await resend.emails.send({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      if (error) {
        throw new InternalServerErrorException(
          error.message || 'Failed to send email. Contact platform support.',
        );
      }
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Failed to send email. Contact platform support.',
      );
    }
  }

  private getSmtpProfiles(): SystemSmtpConfig[] {
    const profiles = this.config.get<SystemSmtpConfig[]>(
      'systemMail.smtpProfiles',
    );
    if (profiles && profiles.length > 0) {
      return profiles;
    }

    const host = this.config.get<string>('smtp.host');
    const user = this.config.get<string>('smtp.user');
    const pass = this.config.get<string>('smtp.pass');
    if (!host || !user || !pass) {
      return [];
    }

    return [
      {
        host,
        port: this.config.get<number>('smtp.port') ?? 587,
        user,
        pass,
        from: this.config.get<string>('smtp.from') ?? 'noreply@markos.dev',
        secure: this.config.get<boolean>('smtp.secure') ?? false,
      },
    ];
  }

  private async sendViaSmtp(message: OutboundEmail): Promise<void> {
    const profiles = this.getSmtpProfiles();
    if (profiles.length === 0) {
      throw new InternalServerErrorException(
        'Email service is not configured. Contact platform support.',
      );
    }

    let lastError: unknown;
    for (const profile of profiles) {
      try {
        const transporter = this.getTransporter(profile);
        await transporter.sendMail({
          from: profile.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
        return;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError instanceof Error) {
      throw new InternalServerErrorException(
        'Email service is unreachable. Contact platform support.',
      );
    }

    throw new InternalServerErrorException(
      'Email service is unreachable. Contact platform support.',
    );
  }

  private transporterCacheKey(profile: SystemSmtpConfig): string {
    return `${profile.host}:${profile.port}:${profile.user}`;
  }

  private getTransporter(profile: SystemSmtpConfig): Transporter {
    const key = this.transporterCacheKey(profile);
    const cached = this.transporters.get(key);
    if (cached) {
      return cached;
    }

    const requireTLS = !profile.secure && profile.port === 587;

    const transporter = nodemailer.createTransport({
      host: profile.host,
      port: profile.port,
      secure: profile.secure,
      requireTLS,
      auth: { user: profile.user, pass: profile.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    this.transporters.set(key, transporter);
    return transporter;
  }
}
