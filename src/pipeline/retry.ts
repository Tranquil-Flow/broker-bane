import { exponentialBackoff, sleep } from "../util/delay.js";
import type { RetryConfig } from "../types/config.js";
import { logger } from "../util/logger.js";

export interface RetryOptions {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  jitter: number;
}

export function configToRetryOptions(config: RetryConfig): RetryOptions {
  return {
    maxAttempts: config.max_attempts,
    initialDelayMs: config.initial_delay_ms,
    backoffMultiplier: config.backoff_multiplier,
    jitter: config.jitter,
  };
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  label = "operation"
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === options.maxAttempts - 1;

      if (isLastAttempt) {
        logger.error(
          { attempt: attempt + 1, maxAttempts: options.maxAttempts, label },
          `${label} failed after all retries`
        );
        break;
      }

      const delayMs = exponentialBackoff(
        attempt,
        options.initialDelayMs,
        options.backoffMultiplier,
        options.jitter
      );

      logger.warn(
        { attempt: attempt + 1, delayMs, label },
        `${label} failed, retrying after delay`
      );

      await sleep(delayMs);
    }
  }

  throw lastError;
}
