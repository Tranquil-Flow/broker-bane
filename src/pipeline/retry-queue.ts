import type { RetryQueueRepo, RetryTaskType, RetryQueueEntry } from "../db/repositories/retry-queue.repo.js";
import type { RetryQueueRow } from "../types/database.js";
import { exponentialBackoff } from "../util/delay.js";
import { logger } from "../util/logger.js";

export interface RetryQueueConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffMultiplier: number;
  jitter: number;
}

const DEFAULT_CONFIG: RetryQueueConfig = {
  maxAttempts: 5,
  initialDelayMs: 60_000, // 1 minute
  backoffMultiplier: 2,
  jitter: 0.25,
};

/** Error codes that indicate transient failures worth retrying */
const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

/** HTTP status codes that indicate transient failures */
const TRANSIENT_HTTP_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
]);

export interface TransientError {
  message: string;
  code?: string;
  statusCode?: number;
}

/**
 * Determine if an error is transient (worth retrying).
 */
export function isTransientError(err: unknown): err is TransientError {
  if (err === null || typeof err !== "object") return false;

  const e = err as Record<string, unknown>;

  // Check error code
  if (typeof e.code === "string" && TRANSIENT_ERROR_CODES.has(e.code)) {
    return true;
  }

  // Check HTTP status code
  if (typeof e.statusCode === "number" && TRANSIENT_HTTP_CODES.has(e.statusCode)) {
    return true;
  }
  if (typeof e.status === "number" && TRANSIENT_HTTP_CODES.has(e.status)) {
    return true;
  }

  // Check for network timeout messages
  if (typeof e.message === "string") {
    const msg = e.message.toLowerCase();
    if (
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("connection reset") ||
      msg.includes("socket hang up") ||
      msg.includes("econnreset") ||
      msg.includes("5xx") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504")
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Extract error info for logging and storage.
 */
export function extractErrorInfo(err: unknown): { message: string; code?: string } {
  if (err instanceof Error) {
    const e = err as Error & { code?: string };
    return {
      message: err.message,
      code: typeof e.code === "string" ? e.code : undefined,
    };
  }
  return { message: String(err) };
}

/**
 * Manages a queue of failed tasks for retry with exponential backoff.
 */
export class RetryQueue {
  private readonly config: RetryQueueConfig;

  constructor(
    private readonly repo: RetryQueueRepo,
    config: Partial<RetryQueueConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Enqueue a failed task for retry if it's a transient error.
   * Returns true if queued, false if not (permanent failure or max attempts).
   */
  enqueueIfTransient(
    brokerId: string,
    taskType: RetryTaskType,
    payload: unknown,
    error: unknown
  ): boolean {
    if (!isTransientError(error)) {
      logger.debug(
        { brokerId, taskType },
        "Error is not transient, not queuing for retry"
      );
      return false;
    }

    const errorInfo = extractErrorInfo(error);
    const nextRetryAt = this.calculateNextRetry(0); // First retry

    const id = this.repo.enqueue({
      brokerId,
      taskType,
      payload,
      errorMessage: errorInfo.message,
      errorCode: errorInfo.code,
      attemptCount: 1,
      nextRetryAt,
    });

    logger.info(
      { brokerId, taskType, id, nextRetryAt: nextRetryAt.toISOString() },
      "Queued task for retry"
    );

    return true;
  }

  /**
   * Get tasks ready for retry.
   */
  getReadyTasks(limit = 10): RetryQueueRow[] {
    return this.repo.getReady(limit);
  }

  /**
   * Record a retry attempt result.
   * If successful, removes from queue.
   * If failed, updates attempt count and schedules next retry (or removes if max attempts).
   */
  recordResult(
    id: number,
    success: boolean,
    error?: unknown
  ): { removed: boolean; requeued: boolean } {
    const item = this.repo.get(id);
    if (!item) {
      return { removed: false, requeued: false };
    }

    if (success) {
      this.repo.remove(id);
      logger.info(
        { id, brokerId: item.broker_id, taskType: item.task_type },
        "Retry succeeded, removed from queue"
      );
      return { removed: true, requeued: false };
    }

    const newAttemptCount = item.attempt_count + 1;

    if (newAttemptCount >= this.config.maxAttempts) {
      this.repo.remove(id);
      logger.warn(
        { id, brokerId: item.broker_id, taskType: item.task_type, attempts: newAttemptCount },
        "Max retry attempts reached, removed from queue"
      );
      return { removed: true, requeued: false };
    }

    // Only requeue if still a transient error
    if (!isTransientError(error)) {
      this.repo.remove(id);
      logger.info(
        { id, brokerId: item.broker_id, taskType: item.task_type },
        "Error no longer transient, removed from queue"
      );
      return { removed: true, requeued: false };
    }

    const errorInfo = extractErrorInfo(error);
    const nextRetryAt = this.calculateNextRetry(newAttemptCount - 1);

    this.repo.update(id, {
      attemptCount: newAttemptCount,
      nextRetryAt,
      errorMessage: errorInfo.message,
    });

    logger.info(
      {
        id,
        brokerId: item.broker_id,
        taskType: item.task_type,
        attempt: newAttemptCount,
        nextRetryAt: nextRetryAt.toISOString(),
      },
      "Retry failed, scheduled for next attempt"
    );

    return { removed: false, requeued: true };
  }

  /**
   * Force-add a task to the retry queue (even if not transient).
   * Useful for manual requeuing.
   */
  forceEnqueue(entry: Omit<RetryQueueEntry, "nextRetryAt"> & { delayMs?: number }): number {
    const nextRetryAt = new Date(Date.now() + (entry.delayMs ?? this.config.initialDelayMs));
    return this.repo.enqueue({
      ...entry,
      nextRetryAt,
    });
  }

  /**
   * Remove a task from the queue.
   */
  remove(id: number): void {
    this.repo.remove(id);
  }

  /**
   * Remove all tasks for a broker.
   */
  removeByBroker(brokerId: string): number {
    return this.repo.removeByBroker(brokerId);
  }

  /**
   * Get queue stats.
   */
  getStats(): { pending: number; ready: number } {
    return {
      pending: this.repo.countPending(),
      ready: this.repo.countReady(),
    };
  }

  /**
   * Clean up tasks that have exceeded max attempts.
   */
  cleanup(): number {
    return this.repo.cleanup(this.config.maxAttempts);
  }

  /**
   * Parse the payload from a queue row.
   */
  parsePayload<T>(row: RetryQueueRow): T {
    return JSON.parse(row.payload) as T;
  }

  /**
   * Calculate the next retry time based on attempt number.
   */
  private calculateNextRetry(attemptNumber: number): Date {
    const delayMs = exponentialBackoff(
      attemptNumber,
      this.config.initialDelayMs,
      this.config.backoffMultiplier,
      this.config.jitter
    );
    return new Date(Date.now() + delayMs);
  }
}
