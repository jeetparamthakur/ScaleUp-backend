export interface PostgresConnectionTarget {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export function parsePostgresConnection(
  databaseUrl: string,
): PostgresConnectionTarget {
  const normalized = databaseUrl
    .replace(/^postgresql:/i, 'http:')
    .replace(/^postgres:/i, 'http:');
  const parsed = new URL(normalized);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '')).split(
    '/',
  )[0];

  if (!parsed.hostname || !database) {
    throw new Error('DATABASE_URL is invalid.');
  }

  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 5432,
    username: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
}

export const HOSTED_PG_SSL = { rejectUnauthorized: false } as const;

export function disableEnvSslVerification(): void {
  process.env.PGSSLMODE = 'no-verify';
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  delete process.env.PGSSLROOTCERT;
  delete process.env.PGSSLCERT;
  delete process.env.PGSSLKEY;
}
