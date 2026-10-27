export interface GmailSystemMailPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

function encodeMimeHeaderValue(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) {
    return value;
  }
  const encoded = Buffer.from(value, 'utf8').toString('base64');
  return `=?UTF-8?B?${encoded}?=`;
}

function foldBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function buildGmailRawMessage(payload: GmailSystemMailPayload): string {
  const subject = encodeMimeHeaderValue(payload.subject);
  const lines = [
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 7bit',
    '',
    payload.html,
  ];
  return lines.join('\r\n');
}

export async function refreshGoogleAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const body = (await response.json()) as GoogleTokenResponse;
  const accessToken = body.access_token?.trim();

  if (!response.ok || !accessToken) {
    const detail = body.error_description ?? body.error ?? response.statusText;
    throw new Error(`Google token refresh failed: ${detail}`);
  }

  return accessToken;
}

export async function sendGmailApiMessage(params: {
  accessToken: string;
  rawMessage: string;
}): Promise<void> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: foldBase64Url(params.rawMessage) }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Gmail API send failed (${response.status}): ${detail.slice(0, 500)}`,
    );
  }
}
