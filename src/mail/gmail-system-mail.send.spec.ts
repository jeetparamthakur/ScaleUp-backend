import {
  buildGmailRawMessage,
  sendGmailApiMessage,
} from './gmail-system-mail.send';

describe('gmail-system-mail.send', () => {
  it('builds a minimal HTML MIME message', () => {
    const raw = buildGmailRawMessage({
      from: 'me@gmail.com',
      to: 'user@example.com',
      subject: 'Test',
      text: 'plain',
      html: '<p>Hi</p>',
    });

    expect(raw).toContain('From: me@gmail.com');
    expect(raw).toContain('To: user@example.com');
    expect(raw).toContain('Subject: Test');
    expect(raw).toContain('<p>Hi</p>');
  });

  it('posts base64url-encoded raw to Gmail API', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock as typeof fetch;

    await sendGmailApiMessage({
      accessToken: 'token',
      rawMessage: 'From: a\r\nTo: b\r\n\r\nHi',
    });

    const firstCall = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, init] = firstCall;
    expect(firstCall[0]).toBe(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token',
    });
  });
});
