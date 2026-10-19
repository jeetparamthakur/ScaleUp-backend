import {
  buildOpenWaWebhookBaseUrlCandidates,
  isOpenWaWebhookBaseUrlPubliclyReachable,
  resolveEffectiveOpenWaWebhookBaseUrl,
} from './openwa-webhook-config.util';

describe('openwa-webhook-config.util', () => {
  describe('resolveEffectiveOpenWaWebhookBaseUrl', () => {
    it('prefers OPENWA_WEBHOOK_BASE_URL when set', () => {
      expect(
        resolveEffectiveOpenWaWebhookBaseUrl({
          openwaWebhookBaseUrl: 'https://tunnel.example.com/',
          backendUrl: 'http://localhost:3008',
        }),
      ).toBe('https://tunnel.example.com');
    });

    it('uses public BACKEND_URL when explicit webhook base is unset', () => {
      expect(
        resolveEffectiveOpenWaWebhookBaseUrl({
          backendUrl: 'https://api.example.com',
        }),
      ).toBe('https://api.example.com');
    });

    it('falls back to public TRACKING_BASE_URL when BACKEND_URL is local', () => {
      expect(
        resolveEffectiveOpenWaWebhookBaseUrl({
          backendUrl: 'http://localhost:3008',
          trackingBaseUrl: 'https://app.example.com/api',
        }),
      ).toBe('https://app.example.com/api');
    });

    it('normalizes local BACKEND_URL to 127.0.0.1', () => {
      expect(
        resolveEffectiveOpenWaWebhookBaseUrl({
          backendUrl: 'http://localhost:3008',
          trackingBaseUrl: 'http://localhost:3008',
        }),
      ).toBe('http://127.0.0.1:3008');
    });

    it('defaults to 127.0.0.1 when nothing is configured', () => {
      expect(resolveEffectiveOpenWaWebhookBaseUrl({ defaultPort: 3009 })).toBe(
        'http://127.0.0.1:3009',
      );
    });
  });

  describe('buildOpenWaWebhookBaseUrlCandidates', () => {
    it('includes localhost and 127.0.0.1 for local backends', () => {
      expect(
        buildOpenWaWebhookBaseUrlCandidates({
          backendUrl: 'http://localhost:3008',
        }),
      ).toEqual(['http://127.0.0.1:3008', 'http://localhost:3008']);
    });
  });

  describe('isOpenWaWebhookBaseUrlPubliclyReachable', () => {
    it('returns false for loopback hosts', () => {
      expect(
        isOpenWaWebhookBaseUrlPubliclyReachable('http://localhost:3008'),
      ).toBe(false);
    });

    it('returns true for public hosts', () => {
      expect(
        isOpenWaWebhookBaseUrlPubliclyReachable('https://api.example.com'),
      ).toBe(true);
    });
  });
});
