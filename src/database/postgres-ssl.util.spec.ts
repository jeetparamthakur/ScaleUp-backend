import { parsePostgresConnection } from './postgres-ssl.util';

describe('parsePostgresConnection', () => {
  it('parses a Render-style URL without using sslmode query params', () => {
    const result = parsePostgresConnection(
      'postgresql://appuser:p%40ss@dpg-example:5432/markos?sslmode=require',
    );

    expect(result).toEqual({
      host: 'dpg-example',
      port: 5432,
      username: 'appuser',
      password: 'p@ss',
      database: 'markos',
    });
  });

  it('defaults to port 5432 when the URL omits it', () => {
    const result = parsePostgresConnection(
      'postgres://appuser:secret@dpg-example/markos',
    );

    expect(result.port).toBe(5432);
    expect(result.database).toBe('markos');
  });
});
