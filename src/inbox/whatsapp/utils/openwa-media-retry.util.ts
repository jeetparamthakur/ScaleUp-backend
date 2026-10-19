import { BadGatewayException } from '@nestjs/common';

const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export function isRetriableOpenWaHttpStatus(status: number): boolean {
  return RETRIABLE_STATUS.has(status);
}

export function parseOpenWaHttpStatusFromError(error: unknown): number | null {
  if (!(error instanceof BadGatewayException)) {
    return null;
  }
  const match = /\((\d{3})\)/.exec(error.message);
  if (!match) {
    return null;
  }
  const status = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(status) ? status : null;
}

export function isRetriableOpenWaMediaError(error: unknown): boolean {
  const status = parseOpenWaHttpStatusFromError(error);
  return status !== null && isRetriableOpenWaHttpStatus(status);
}

export async function withOpenWaMediaRetries<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    rateLimitBaseDelayMs?: number;
  } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 1500;
  const rateLimitBaseDelayMs = options.rateLimitBaseDelayMs ?? 5000;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetriableOpenWaMediaError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const status = parseOpenWaHttpStatusFromError(error);
      const delayMs =
        status === 429
          ? rateLimitBaseDelayMs * 2 ** attempt
          : baseDelayMs * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}
