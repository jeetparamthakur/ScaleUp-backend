const HOSTED_SSL_PARAMS = {
  sslmode: 'no-verify',
  uselibpqcompat: 'true',
} as const;

export function withHostedPostgresSsl(databaseUrl: string): string {
  const [base, query = ''] = databaseUrl.split('?');
  const params = new URLSearchParams(query);

  params.set('sslmode', HOSTED_SSL_PARAMS.sslmode);
  params.set('uselibpqcompat', HOSTED_SSL_PARAMS.uselibpqcompat);

  return `${base}?${params.toString()}`;
}
