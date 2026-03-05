import type { Database } from "better-sqlite3";
import type { EvidenceChainRow } from "../../types/database.js";

export class EvidenceChainRepo {
  constructor(private readonly db: Database) {}

  create(data: {
    requestId?: number;
    scanResultId?: number;
    entryType: string;
    contentHash: string;
    prevHash: string;
    screenshotPath?: string;
    pageText?: string;
    pageTextHash?: string;
    brokerUrl?: string;
    brokerId: string;
    metadata?: string;
  }): EvidenceChainRow {
    const stmt = this.db.prepare(
      `INSERT INTO evidence_chain
       (request_id, scan_result_id, entry_type, content_hash, prev_hash,
        screenshot_path, page_text, page_text_hash, broker_url, broker_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const result = stmt.run(
      data.requestId ?? null,
      data.scanResultId ?? null,
      data.entryType,
      data.contentHash,
      data.prevHash,
      data.screenshotPath ?? null,
      data.pageText ?? null,
      data.pageTextHash ?? null,
      data.brokerUrl ?? null,
      data.brokerId,
      data.metadata ?? null
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): EvidenceChainRow | undefined {
    return this.db
      .prepare("SELECT * FROM evidence_chain WHERE id = ?")
      .get(id) as EvidenceChainRow | undefined;
  }

  getLatest(): EvidenceChainRow | undefined {
    return this.db
      .prepare("SELECT * FROM evidence_chain ORDER BY id DESC LIMIT 1")
      .get() as EvidenceChainRow | undefined;
  }

  getLatestHash(): string {
    const row = this.getLatest();
    return row?.content_hash ?? "0".repeat(64);
  }

  getAll(): EvidenceChainRow[] {
    return this.db
      .prepare("SELECT * FROM evidence_chain ORDER BY id ASC")
      .all() as EvidenceChainRow[];
  }

  getChainSegment(startId: number, endId?: number): EvidenceChainRow[] {
    if (endId !== undefined) {
      return this.db
        .prepare("SELECT * FROM evidence_chain WHERE id >= ? AND id <= ? ORDER BY id ASC")
        .all(startId, endId) as EvidenceChainRow[];
    }
    return this.db
      .prepare("SELECT * FROM evidence_chain WHERE id >= ? ORDER BY id ASC")
      .all(startId) as EvidenceChainRow[];
  }

  getByBrokerId(brokerId: string): EvidenceChainRow[] {
    return this.db
      .prepare("SELECT * FROM evidence_chain WHERE broker_id = ? ORDER BY id ASC")
      .all(brokerId) as EvidenceChainRow[];
  }

  getByRequestId(requestId: number): EvidenceChainRow[] {
    return this.db
      .prepare("SELECT * FROM evidence_chain WHERE request_id = ? ORDER BY id ASC")
      .all(requestId) as EvidenceChainRow[];
  }

  getByScanResultId(scanResultId: number): EvidenceChainRow[] {
    return this.db
      .prepare("SELECT * FROM evidence_chain WHERE scan_result_id = ? ORDER BY id ASC")
      .all(scanResultId) as EvidenceChainRow[];
  }

  updateContentHash(id: number, contentHash: string): void {
    this.db
      .prepare("UPDATE evidence_chain SET content_hash = ? WHERE id = ?")
      .run(contentHash, id);
  }

  count(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM evidence_chain")
      .get() as { cnt: number };
    return row.cnt;
  }
}
