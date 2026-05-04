import type { Database } from "better-sqlite3";
import type { EmailLogRow } from "../../types/database.js";

export class EmailLogRepo {
  constructor(private readonly db: Database) {}

  create(params: {
    requestId: number;
    direction: string;
    messageId?: string;
    identityId?: string;
    fromAddr: string;
    toAddr: string;
    subject: string;
    status: string;
  }): EmailLogRow {
    const stmt = this.db.prepare(`
      INSERT INTO email_log (request_id, direction, message_id, identity_id, from_addr, to_addr, subject, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      params.requestId,
      params.direction,
      params.messageId ?? null,
      params.identityId ?? "default",
      params.fromAddr,
      params.toAddr,
      params.subject,
      params.status
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): EmailLogRow | undefined {
    return this.db
      .prepare("SELECT * FROM email_log WHERE id = ?")
      .get(id) as EmailLogRow | undefined;
  }

  getByRequestId(requestId: number): EmailLogRow[] {
    return this.db
      .prepare("SELECT * FROM email_log WHERE request_id = ? ORDER BY created_at")
      .all(requestId) as EmailLogRow[];
  }

  getByMessageId(messageId: string): EmailLogRow | undefined {
    return this.db
      .prepare("SELECT * FROM email_log WHERE message_id = ?")
      .get(messageId) as EmailLogRow | undefined;
  }

  countSentToday(identityId?: string): number {
    const whereIdentity = identityId ? "AND identity_id = ?" : "";
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as count FROM email_log
         WHERE direction = 'outbound' AND status = 'sent'
         AND date(created_at) = date('now')
         ${whereIdentity}`
      )
      .get(...(identityId ? [identityId] : [])) as { count: number };
    return row.count;
  }
}
