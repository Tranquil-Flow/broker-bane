import type { Database } from "better-sqlite3";
import type { RescanScheduleRow } from "../../types/database.js";

export class RescanScheduleRepo {
  constructor(private readonly db: Database) {}

  /**
   * Schedule (or re-schedule) a broker for rescan.
   * next_rescan_at is set to now + intervalDays.
   */
  upsert(brokerId: string, intervalDays: number = 90): RescanScheduleRow {
    this.db
      .prepare(
        `INSERT INTO rescan_schedule (broker_id, next_rescan_at, interval_days)
         VALUES (?, datetime('now', ? || ' days'), ?)
         ON CONFLICT(broker_id) DO UPDATE SET
           next_rescan_at = datetime('now', excluded.interval_days || ' days'),
           interval_days = excluded.interval_days,
           updated_at = datetime('now')`
      )
      .run(brokerId, `+${intervalDays}`, intervalDays);
    return this.getByBrokerId(brokerId)!;
  }

  /**
   * Returns all brokers whose next_rescan_at is now or in the past.
   */
  getDue(): RescanScheduleRow[] {
    return this.db
      .prepare(
        `SELECT * FROM rescan_schedule
         WHERE next_rescan_at <= datetime('now')
         ORDER BY next_rescan_at ASC`
      )
      .all() as RescanScheduleRow[];
  }

  /** Returns all rescan schedule entries. */
  getAll(): RescanScheduleRow[] {
    return this.db
      .prepare("SELECT * FROM rescan_schedule ORDER BY next_rescan_at ASC")
      .all() as RescanScheduleRow[];
  }

  /** Lookup a single broker's schedule. */
  getByBrokerId(brokerId: string): RescanScheduleRow | undefined {
    return this.db
      .prepare("SELECT * FROM rescan_schedule WHERE broker_id = ?")
      .get(brokerId) as RescanScheduleRow | undefined;
  }

  /**
   * Mark a broker as rescanned: update last_rescan_at to now and
   * advance next_rescan_at by the stored interval_days.
   */
  markRescanned(brokerId: string): void {
    this.db
      .prepare(
        `UPDATE rescan_schedule
         SET last_rescan_at = datetime('now'),
             next_rescan_at = datetime('now', interval_days || ' days'),
             updated_at = datetime('now')
         WHERE broker_id = ?`
      )
      .run(brokerId);
  }

  /** Delete a broker's rescan schedule. */
  remove(brokerId: string): void {
    this.db
      .prepare("DELETE FROM rescan_schedule WHERE broker_id = ?")
      .run(brokerId);
  }
}
