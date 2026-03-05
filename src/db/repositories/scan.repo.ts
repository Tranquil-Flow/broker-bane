import type { Database } from "better-sqlite3";
import type { ScanRunRow, ScanResultRow } from "../../types/database.js";

export class ScanRunRepo {
  constructor(private readonly db: Database) {}

  create(totalBrokers: number): ScanRunRow {
    const stmt = this.db.prepare(
      "INSERT INTO scan_runs (total_brokers) VALUES (?)"
    );
    const result = stmt.run(totalBrokers);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): ScanRunRow | undefined {
    return this.db
      .prepare("SELECT * FROM scan_runs WHERE id = ?")
      .get(id) as ScanRunRow | undefined;
  }

  getLatest(): ScanRunRow | undefined {
    return this.db
      .prepare("SELECT * FROM scan_runs ORDER BY id DESC LIMIT 1")
      .get() as ScanRunRow | undefined;
  }

  finish(id: number, status: string, counts: { found: number; notFound: number; errors: number }): void {
    this.db
      .prepare(
        `UPDATE scan_runs
         SET finished_at = datetime('now'), status = ?, found_count = ?, not_found_count = ?, error_count = ?
         WHERE id = ?`
      )
      .run(status, counts.found, counts.notFound, counts.errors, id);
  }

  incrementFound(id: number): void {
    this.db
      .prepare("UPDATE scan_runs SET found_count = found_count + 1 WHERE id = ?")
      .run(id);
  }

  incrementNotFound(id: number): void {
    this.db
      .prepare("UPDATE scan_runs SET not_found_count = not_found_count + 1 WHERE id = ?")
      .run(id);
  }

  incrementError(id: number): void {
    this.db
      .prepare("UPDATE scan_runs SET error_count = error_count + 1 WHERE id = ?")
      .run(id);
  }

  getHistory(limit: number = 10): ScanRunRow[] {
    return this.db
      .prepare("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ?")
      .all(limit) as ScanRunRow[];
  }
}

export class ScanResultRepo {
  constructor(private readonly db: Database) {}

  create(data: {
    scanRunId: number;
    brokerId: string;
    found: boolean;
    confidence?: number;
    profileData?: string;
    screenshotPath?: string;
    pageText?: string;
    error?: string;
  }): ScanResultRow {
    const stmt = this.db.prepare(
      `INSERT INTO scan_results (scan_run_id, broker_id, found, confidence, profile_data, screenshot_path, page_text, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      data.scanRunId,
      data.brokerId,
      data.found ? 1 : 0,
      data.confidence ?? null,
      data.profileData ?? null,
      data.screenshotPath ?? null,
      data.pageText ?? null,
      data.error ?? null
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): ScanResultRow | undefined {
    return this.db
      .prepare("SELECT * FROM scan_results WHERE id = ?")
      .get(id) as ScanResultRow | undefined;
  }

  getByRunId(scanRunId: number): ScanResultRow[] {
    return this.db
      .prepare("SELECT * FROM scan_results WHERE scan_run_id = ? ORDER BY created_at")
      .all(scanRunId) as ScanResultRow[];
  }

  getFoundByRunId(scanRunId: number): ScanResultRow[] {
    return this.db
      .prepare("SELECT * FROM scan_results WHERE scan_run_id = ? AND found = 1 ORDER BY created_at")
      .all(scanRunId) as ScanResultRow[];
  }

  getLatestForBroker(brokerId: string): ScanResultRow | undefined {
    return this.db
      .prepare("SELECT * FROM scan_results WHERE broker_id = ? ORDER BY id DESC LIMIT 1")
      .get(brokerId) as ScanResultRow | undefined;
  }
}
