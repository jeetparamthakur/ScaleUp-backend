import {
  BadGatewayException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  isRetriableOpenWaHttpStatus,
  parseOpenWaHttpStatusFromError,
} from './openwa-media-retry.util';

export function isOpenWaRateLimitError(error: unknown): boolean {
  if (!(error instanceof BadGatewayException)) {
    return false;
  }
  return /\(429\)/.test(error.message);
}

export function throwIfOpenWaRateLimited(error: unknown): void {
  if (!(error instanceof BadGatewayException)) {
    return;
  }
  const match = /\((\d{3})\)/.exec(error.message);
  const status = match ? Number.parseInt(match[1] ?? '', 10) : null;
  if (status === 429) {
    throw new HttpException(
      {
        message:
          'WhatsApp gateway is rate-limited while loading media. Wait a few seconds and retry.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) {
    throw new HttpException(
      {
        message:
          'WhatsApp gateway failed while loading media. Wait a few seconds and retry.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

export function isOpenWaTransientGatewayError(error: unknown): boolean {
  return (
    error instanceof BadGatewayException ||
    error instanceof ServiceUnavailableException
  );
}

/** Whether to try the next chat/message candidate after a failed OpenWA GET /media. */
export function shouldContinueOpenWaMediaFetchAfterError(
  error: unknown,
): boolean {
  if (error instanceof ServiceUnavailableException) {
    return true;
  }
  const status = parseOpenWaHttpStatusFromError(error);
  if (status === 404) {
    return true;
  }
  return status !== null && isRetriableOpenWaHttpStatus(status);
}
