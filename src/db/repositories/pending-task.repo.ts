import type { Database } from "better-sqlite3";
import type { PendingTaskRow } from "../../types/database.js";

export class PendingTaskRepo {
  constructor(private readonly db: Database) {}

  create(params: {
    requestId: number;
    taskType: string;
    description: string;
    url?: string;
  }): PendingTaskRow {
    const stmt = this.db.prepare(`
      INSERT INTO pending_tasks (request_id, task_type, description, url)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.requestId,
      params.taskType,
      params.description,
      params.url ?? null
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): PendingTaskRow | undefined {
    return this.db
      .prepare("SELECT * FROM pending_tasks WHERE id = ?")
      .get(id) as PendingTaskRow | undefined;
  }

  getPending(): PendingTaskRow[] {
    return this.db
      .prepare("SELECT * FROM pending_tasks WHERE is_completed = 0 ORDER BY created_at")
      .all() as PendingTaskRow[];
  }

  getByRequestId(requestId: number): PendingTaskRow[] {
    return this.db
      .prepare("SELECT * FROM pending_tasks WHERE request_id = ? ORDER BY created_at")
      .all(requestId) as PendingTaskRow[];
  }

  markCompleted(id: number): void {
    this.db
      .prepare(
        "UPDATE pending_tasks SET is_completed = 1, completed_at = datetime('now') WHERE id = ?"
      )
      .run(id);
  }

  countPending(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as count FROM pending_tasks WHERE is_completed = 0")
      .get() as { count: number };
    return row.count;
  }
}
