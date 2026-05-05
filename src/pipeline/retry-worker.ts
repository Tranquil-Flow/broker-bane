import type { EmailLogRepo } from "../db/repositories/email-log.repo.js";
import type { RetryTaskType } from "../db/repositories/retry-queue.repo.js";
import type { RetryQueueRow } from "../types/database.js";
import type { RetryQueue } from "./retry-queue.js";

export interface RetryWorkerTaskContext<TPayload = unknown> {
  row: RetryQueueRow;
  payload: TPayload;
}

export type RetryWorkerHandler<TPayload = unknown> = (
  context: RetryWorkerTaskContext<TPayload>
) => Promise<void> | void;

export type RetryWorkerHandlers = Partial<Record<RetryTaskType, RetryWorkerHandler>>;

export interface RetryWorkerOptions {
  queue: RetryQueue;
  emailLogRepo: EmailLogRepo;
  identityId: string;
  dailyLimit: number;
  handlers: RetryWorkerHandlers;
}

export interface RetryWorkerRunOptions {
  limit?: number;
}

export interface RetryWorkerResult {
  considered: number;
  processed: number;
  succeeded: number;
  failed: number;
  requeued: number;
  removed: number;
  skippedDailyCap: number;
}

const DEFAULT_LIMIT = 5;

export class RetryWorker {
  constructor(private readonly options: RetryWorkerOptions) {}

  async processReady(runOptions: RetryWorkerRunOptions = {}): Promise<RetryWorkerResult> {
    const limit = runOptions.limit ?? DEFAULT_LIMIT;
    const ready = this.options.queue.getReadyTasks(limit);
    const result: RetryWorkerResult = {
      considered: ready.length,
      processed: 0,
      succeeded: 0,
      failed: 0,
      requeued: 0,
      removed: 0,
      skippedDailyCap: 0,
    };

    let emailSentToday = this.options.emailLogRepo.countSentToday(this.options.identityId);

    for (const row of ready) {
      if (row.task_type === "email" && emailSentToday >= this.options.dailyLimit) {
        result.skippedDailyCap += 1;
        continue;
      }

      const taskType = row.task_type as RetryTaskType;
      const handler = this.options.handlers[taskType];
      result.processed += 1;

      if (!handler) {
        const recorded = this.options.queue.recordResult(
          row.id,
          false,
          new Error(`No retry handler configured for ${row.task_type}`)
        );
        result.failed += 1;
        if (recorded.requeued) result.requeued += 1;
        if (recorded.removed) result.removed += 1;
        continue;
      }

      try {
        const payload = this.options.queue.parsePayload(row);
        await handler({ row, payload });
        const recorded = this.options.queue.recordResult(row.id, true);
        result.succeeded += 1;
        if (recorded.removed) result.removed += 1;
        if (row.task_type === "email") emailSentToday += 1;
      } catch (error) {
        const recorded = this.options.queue.recordResult(row.id, false, error);
        result.failed += 1;
        if (recorded.requeued) result.requeued += 1;
        if (recorded.removed) result.removed += 1;
      }
    }

    return result;
  }
}
