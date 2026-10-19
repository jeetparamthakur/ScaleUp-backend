import { BadGatewayException } from '@nestjs/common';
import {
  isRetriableOpenWaMediaError,
  withOpenWaMediaRetries,
} from './openwa-media-retry.util';

describe('openwa-media-retry.util', () => {
  it('retries retriable OpenWA statuses', async () => {
    let calls = 0;
    const result = await withOpenWaMediaRetries(
      () => {
        calls += 1;
        if (calls < 3) {
          throw new BadGatewayException(
            'OpenWA request failed (429): throttled',
          );
        }
        return Promise.resolve('ok');
      },
      { maxAttempts: 4, baseDelayMs: 1, rateLimitBaseDelayMs: 1 },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('does not retry non-retriable errors', async () => {
    await expect(
      withOpenWaMediaRetries(() =>
        Promise.reject(
          new BadGatewayException('OpenWA request failed (404): missing'),
        ),
      ),
    ).rejects.toThrow('404');
  });

  it('detects retriable 500', () => {
    expect(
      isRetriableOpenWaMediaError(
        new BadGatewayException('OpenWA request failed (500): internal'),
      ),
    ).toBe(true);
  });
});
