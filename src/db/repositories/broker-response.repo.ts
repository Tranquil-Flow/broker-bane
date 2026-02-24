import type { Database } from "better-sqlite3";
import type { BrokerResponseRow } from "../../types/database.js";

export class BrokerResponseRepo {
  constructor(private readonly db: Database) {}

  create(params: {
    requestId: number;
    responseType: string;
    rawSubject?: string;
    rawFrom?: string;
    rawBodyHash: string;
    confirmationUrl?: string;
    urlDomain?: string;
  }): BrokerResponseRow {
    const stmt = this.db.prepare(`
      INSERT INTO broker_responses (request_id, response_type, raw_subject, raw_from, raw_body_hash, confirmation_url, url_domain)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.requestId,
      params.responseType,
      params.rawSubject ?? null,
      params.rawFrom ?? null,
      params.rawBodyHash,
      params.confirmationUrl ?? null,
      params.urlDomain ?? null
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): BrokerResponseRow | undefined {
    return this.db
      .prepare("SELECT * FROM broker_responses WHERE id = ?")
      .get(id) as BrokerResponseRow | undefined;
  }

  getByRequestId(requestId: number): BrokerResponseRow[] {
    return this.db
      .prepare("SELECT * FROM broker_responses WHERE request_id = ? ORDER BY created_at")
      .all(requestId) as BrokerResponseRow[];
  }

  getUnprocessed(): BrokerResponseRow[] {
    return this.db
      .prepare("SELECT * FROM broker_responses WHERE is_processed = 0 ORDER BY created_at")
      .all() as BrokerResponseRow[];
  }

  markProcessed(id: number): void {
    this.db.prepare("UPDATE broker_responses SET is_processed = 1 WHERE id = ?").run(id);
  }

  existsByHash(hash: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM broker_responses WHERE raw_body_hash = ? LIMIT 1")
      .get(hash);
    return row !== undefined;
  }
}
