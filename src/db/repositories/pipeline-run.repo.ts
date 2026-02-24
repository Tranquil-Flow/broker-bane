import type { Database } from "better-sqlite3";
import type { PipelineRunRow } from "../../types/database.js";

export class PipelineRunRepo {
  constructor(private readonly db: Database) {}

  create(totalBrokers: number): PipelineRunRow {
    const stmt = this.db.prepare(
      "INSERT INTO pipeline_runs (total_brokers) VALUES (?)"
    );
    const result = stmt.run(totalBrokers);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): PipelineRunRow | undefined {
    return this.db
      .prepare("SELECT * FROM pipeline_runs WHERE id = ?")
      .get(id) as PipelineRunRow | undefined;
  }

  getLatest(): PipelineRunRow | undefined {
    return this.db
      .prepare("SELECT * FROM pipeline_runs ORDER BY id DESC LIMIT 1")
      .get() as PipelineRunRow | undefined;
  }

  finish(id: number, status: string, counts: { sent: number; failed: number; skipped: number }): void {
    this.db
      .prepare(
        `UPDATE pipeline_runs
         SET finished_at = datetime('now'), status = ?, sent_count = ?, failed_count = ?, skipped_count = ?
         WHERE id = ?`
      )
      .run(status, counts.sent, counts.failed, counts.skipped, id);
  }

  incrementSent(id: number): void {
    this.db
      .prepare("UPDATE pipeline_runs SET sent_count = sent_count + 1 WHERE id = ?")
      .run(id);
  }

  incrementFailed(id: number): void {
    this.db
      .prepare("UPDATE pipeline_runs SET failed_count = failed_count + 1 WHERE id = ?")
      .run(id);
  }

  incrementSkipped(id: number): void {
    this.db
      .prepare("UPDATE pipeline_runs SET skipped_count = skipped_count + 1 WHERE id = ?")
      .run(id);
  }

  getHistory(limit: number = 10): PipelineRunRow[] {
    return this.db
      .prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as PipelineRunRow[];
  }
}
