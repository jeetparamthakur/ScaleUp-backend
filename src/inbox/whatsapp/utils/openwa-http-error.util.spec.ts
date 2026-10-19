import { BadGatewayException, HttpException } from '@nestjs/common';
import {
  isOpenWaRateLimitError,
  shouldContinueOpenWaMediaFetchAfterError,
  throwIfOpenWaRateLimited,
} from './openwa-http-error.util';

describe('openwa-http-error.util', () => {
  it('detects OpenWA 429 wrapped in BadGatewayException', () => {
    const error = new BadGatewayException(
      'OpenWA request failed (429): {"statusCode":429}',
    );
    expect(isOpenWaRateLimitError(error)).toBe(true);
  });

  it('continues media fetch on 404 but not on other client errors', () => {
    expect(
      shouldContinueOpenWaMediaFetchAfterError(
        new BadGatewayException('OpenWA request failed (404): missing'),
      ),
    ).toBe(true);
    expect(
      shouldContinueOpenWaMediaFetchAfterError(
        new BadGatewayException('OpenWA request failed (400): bad id'),
      ),
    ).toBe(false);
  });

  it('maps rate limit to HTTP 429', () => {
    const error = new BadGatewayException(
      'OpenWA request failed (429): throttled',
    );
    expect(() => throwIfOpenWaRateLimited(error)).toThrow(HttpException);
    try {
      throwIfOpenWaRateLimited(error);
    } catch (caught) {
      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(429);
    }
  });
});
