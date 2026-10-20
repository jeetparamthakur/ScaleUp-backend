import { withHostedPostgresSsl } from './postgres-ssl.util';

describe('withHostedPostgresSsl', () => {
  it('adds libpq-compatible sslmode without verifying Render CA', () => {
    const result = withHostedPostgresSsl(
      'postgresql://user:pass@dpg-example:5432/markos',
    );

    expect(result).toContain('sslmode=no-verify');
    expect(result).toContain('uselibpqcompat=true');
  });

  it('replaces verify-full from a Render external URL', () => {
    const result = withHostedPostgresSsl(
      'postgresql://user:pass@host/db?sslmode=verify-full',
    );

    expect(result).toContain('sslmode=no-verify');
    expect(result).not.toContain('verify-full');
  });
});
