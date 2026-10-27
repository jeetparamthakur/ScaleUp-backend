#!/usr/bin/env node
/**
 * One-time helper: obtain GMAIL_OAUTH_REFRESH_TOKEN for system mail on Render.
 *
 * Prerequisites:
 * 1. Google Cloud project with OAuth client (Desktop or Web).
 * 2. Gmail API enabled.
 * 3. OAuth consent screen; add scope https://www.googleapis.com/auth/gmail.send
 *
 * Usage:
 *   GOOGLE_OAUTH_CLIENT_ID=... GOOGLE_OAUTH_CLIENT_SECRET=... node scripts/obtain-gmail-system-mail-token.mjs
 *
 * Sign in with the Google account that should send OTP mail, then paste the redirect URL.
 */

import { createServer } from 'node:http';
import { URL } from 'node:url';

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
const port = Number(process.env.OAUTH_LOCAL_PORT ?? '53682');
const scope = 'https://www.googleapis.com/auth/gmail.send';

if (!clientId || !clientSecret) {
  console.error(
    'Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in the environment.',
  );
  process.exit(1);
}

const redirectUri = `http://127.0.0.1:${port}/callback`;

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', clientId);
authUrl.searchParams.set('redirect_uri', redirectUri);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', scope);
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

console.log('\n1. Open this URL in your browser and sign in with the sender Gmail account:\n');
console.log(authUrl.toString());
console.log('\n2. Waiting for OAuth callback on', redirectUri, '...\n');

const server = createServer(async (req, res) => {
  const requestUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  if (requestUrl.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  if (error || !code) {
    res.writeHead(400);
    res.end(`OAuth error: ${error ?? 'missing code'}`);
    server.close();
    process.exit(1);
    return;
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenResponse.json();
  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('Success. Check your terminal for GMAIL_OAUTH_REFRESH_TOKEN.');

  if (!tokenResponse.ok || !tokens.refresh_token) {
    console.error('Token exchange failed:', tokens);
    server.close();
    process.exit(1);
    return;
  }

  console.log('\nAdd to Render (and local .env for production-like tests):\n');
  console.log(`GMAIL_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  console.log('Keep GMAIL_USER / GMAIL_FROM aligned with that Google account.\n');

  server.close();
  process.exit(0);
});

server.listen(port, '127.0.0.1');
