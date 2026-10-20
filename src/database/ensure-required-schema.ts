import { Logger } from '@nestjs/common';

const SCHEMA_LOCK_KEY = 882_241_017;
const logger = new Logger('DatabaseSchema');

export interface SchemaDataSource {
  query: (sql: string, parameters?: unknown[]) => Promise<unknown>;
  synchronize: () => Promise<void>;
}

function tableExistsResult(rows: unknown): boolean {
  if (!Array.isArray(rows) || rows.length === 0) {
    return false;
  }

  const value = (rows[0] as { exists?: boolean | string }).exists;
  return value === true || value === 't' || value === 'true';
}

export async function ensureRequiredSchema(
  dataSource: SchemaDataSource,
): Promise<void> {
  await dataSource.query('SELECT pg_advisory_lock($1)', [SCHEMA_LOCK_KEY]);

  try {
    try {
      await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      await dataSource.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Could not ensure UUID extensions: ${message}`);
    }

    const rows = await dataSource.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name = 'permissions'
       ) AS exists`,
    );

    if (tableExistsResult(rows)) {
      return;
    }

    logger.warn(
      'Core table "permissions" is missing — creating schema from entities (first boot or empty database)',
    );
    await dataSource.synchronize();
  } finally {
    await dataSource.query('SELECT pg_advisory_unlock($1)', [SCHEMA_LOCK_KEY]);
  }
}
