import type { Database } from "better-sqlite3";
import type { RemovalRequestRow } from "../../types/database.js";

export class RemovalRequestRepo {
  constructor(private readonly db: Database) {}

  create(params: {
    brokerId: string;
    method: string;
    templateUsed?: string;
    emailSentTo?: string;
  }): RemovalRequestRow {
    const stmt = this.db.prepare(`
      INSERT INTO removal_requests (broker_id, method, template_used, email_sent_to)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.brokerId,
      params.method,
      params.templateUsed ?? null,
      params.emailSentTo ?? null
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): RemovalRequestRow | undefined {
    return this.db
      .prepare("SELECT * FROM removal_requests WHERE id = ?")
      .get(id) as RemovalRequestRow | undefined;
  }

  getByBrokerId(brokerId: string): RemovalRequestRow[] {
    return this.db
      .prepare("SELECT * FROM removal_requests WHERE broker_id = ? ORDER BY created_at DESC")
      .all(brokerId) as RemovalRequestRow[];
  }

  getByStatus(status: string): RemovalRequestRow[] {
    return this.db
      .prepare("SELECT * FROM removal_requests WHERE status = ? ORDER BY created_at")
      .all(status) as RemovalRequestRow[];
  }

  updateStatus(id: number, status: string, error?: string): void {
    this.db
      .prepare(
        "UPDATE removal_requests SET status = ?, last_error = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(status, error ?? null, id);
  }

  updateConfidenceScore(id: number, score: number): void {
    this.db
      .prepare(
        "UPDATE removal_requests SET confidence_score = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(score, id);
  }

  incrementAttempt(id: number): void {
    this.db
      .prepare(
        "UPDATE removal_requests SET attempt_count = attempt_count + 1, updated_at = datetime('now') WHERE id = ?"
      )
      .run(id);
  }

  setScreenshot(id: number, path: string): void {
    this.db
      .prepare(
        "UPDATE removal_requests SET screenshot_path = ?, updated_at = datetime('now') WHERE id = ?"
      )
      .run(path, id);
  }

  getAll(): RemovalRequestRow[] {
    return this.db
      .prepare("SELECT * FROM removal_requests ORDER BY created_at")
      .all() as RemovalRequestRow[];
  }

  countByStatus(): Record<string, number> {
    const rows = this.db
      .prepare("SELECT status, COUNT(*) as count FROM removal_requests GROUP BY status")
      .all() as Array<{ status: string; count: number }>;
    return Object.fromEntries(rows.map((r) => [r.status, r.count]));
  }

  getLatestForBroker(brokerId: string): RemovalRequestRow | undefined {
    return this.db
      .prepare(
        "SELECT * FROM removal_requests WHERE broker_id = ? ORDER BY id DESC LIMIT 1"
      )
      .get(brokerId) as RemovalRequestRow | undefined;
  }

  /**
   * Returns the updated_at of the most recent successfully sent request for
   * this broker (status is sent, awaiting_confirmation, confirmed, or completed).
   * Returns null if no such request exists.
   */
  getLastSentAt(brokerId: string): string | null {
    const row = this.db
      .prepare(
        `SELECT updated_at FROM removal_requests
         WHERE broker_id = ?
           AND status IN ('sent', 'awaiting_confirmation', 'confirmed', 'completed')
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(brokerId) as { updated_at: string } | undefined;
    return row?.updated_at ?? null;
  }
}
