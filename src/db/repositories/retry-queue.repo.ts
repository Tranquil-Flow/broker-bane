import type { Database } from "better-sqlite3";
import type { RetryQueueRow } from "../../types/database.js";

export type RetryTaskType = "email" | "web_form" | "confirm_link";

export interface RetryQueueEntry {
  brokerId: string;
  taskType: RetryTaskType;
  payload: unknown;
  errorMessage: string;
  errorCode?: string;
  attemptCount?: number;
  nextRetryAt: Date;
}

export class RetryQueueRepo {
  constructor(private readonly db: Database) {}

  /** Add a new item to the retry queue */
  enqueue(entry: RetryQueueEntry): number {
    const result = this.db
      .prepare(
        `INSERT INTO retry_queue (broker_id, task_type, payload, error_message, error_code, attempt_count, next_retry_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        entry.brokerId,
        entry.taskType,
        JSON.stringify(entry.payload),
        entry.errorMessage,
        entry.errorCode ?? null,
        entry.attemptCount ?? 1,
        entry.nextRetryAt.toISOString()
      );
    return result.lastInsertRowid as number;
  }

  /** Get items ready for retry (next_retry_at <= now in UTC) */
  getReady(limit = 10): RetryQueueRow[] {
    return this.db
      .prepare(
        `SELECT * FROM retry_queue
         WHERE next_retry_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'utc')
         ORDER BY next_retry_at ASC
         LIMIT ?`
      )
      .all(limit) as RetryQueueRow[];
  }

  /** Get all items for a broker */
  getByBroker(brokerId: string): RetryQueueRow[] {
    return this.db
      .prepare("SELECT * FROM retry_queue WHERE broker_id = ? ORDER BY next_retry_at")
      .all(brokerId) as RetryQueueRow[];
  }

  /** Get a single item by ID */
  get(id: number): RetryQueueRow | undefined {
    return this.db
      .prepare("SELECT * FROM retry_queue WHERE id = ?")
      .get(id) as RetryQueueRow | undefined;
  }

  /** Update an item after a retry attempt (bump attempt count, set new retry time) */
  update(
    id: number,
    params: { attemptCount: number; nextRetryAt: Date; errorMessage: string }
  ): void {
    this.db
      .prepare(
        `UPDATE retry_queue
         SET attempt_count = ?, next_retry_at = ?, error_message = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(params.attemptCount, params.nextRetryAt.toISOString(), params.errorMessage, id);
  }

  /** Remove an item from the queue (e.g., on success or permanent failure) */
  remove(id: number): void {
    this.db.prepare("DELETE FROM retry_queue WHERE id = ?").run(id);
  }

  /** Remove all items for a broker */
  removeByBroker(brokerId: string): number {
    const result = this.db
      .prepare("DELETE FROM retry_queue WHERE broker_id = ?")
      .run(brokerId);
    return result.changes;
  }

  /** Count pending items */
  countPending(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM retry_queue")
      .get() as { count: number };
    return row.count;
  }

  /** Count items ready for retry now (UTC comparison) */
  countReady(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM retry_queue
         WHERE next_retry_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'utc')`
      )
      .get() as { count: number };
    return row.count;
  }

  /** Get all items ordered by next_retry_at */
  getAll(): RetryQueueRow[] {
    return this.db
      .prepare("SELECT * FROM retry_queue ORDER BY next_retry_at ASC")
      .all() as RetryQueueRow[];
  }

  /** Clean up old items that have exceeded max attempts */
  cleanup(maxAttempts: number): number {
    const result = this.db
      .prepare("DELETE FROM retry_queue WHERE attempt_count >= ?")
      .run(maxAttempts);
    return result.changes;
  }
}
