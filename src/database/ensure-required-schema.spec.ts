import { ensureRequiredSchema } from './ensure-required-schema';

describe('ensureRequiredSchema', () => {
  it('does not synchronize when the permissions table already exists', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ exists: true }]),
      synchronize: jest.fn(),
    };

    await ensureRequiredSchema(dataSource);

    expect(dataSource.synchronize).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_lock($1)',
      [882_241_017],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [882_241_017],
    );
  });

  it('synchronizes once when the permissions table is missing', async () => {
    const dataSource = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes("table_name = 'permissions'")) {
          return Promise.resolve([{ exists: false }]);
        }

        return Promise.resolve([]);
      }),
      synchronize: jest.fn().mockResolvedValue(undefined),
    };

    await ensureRequiredSchema(dataSource);

    expect(dataSource.synchronize).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"',
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      'CREATE EXTENSION IF NOT EXISTS pgcrypto',
    );
  });

  it('releases the advisory lock when synchronize fails', async () => {
    const dataSource = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes("table_name = 'permissions'")) {
          return Promise.resolve([{ exists: false }]);
        }

        return Promise.resolve([]);
      }),
      synchronize: jest.fn().mockRejectedValue(new Error('sync failed')),
    };

    await expect(ensureRequiredSchema(dataSource)).rejects.toThrow(
      'sync failed',
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_unlock($1)',
      [882_241_017],
    );
  });
});
