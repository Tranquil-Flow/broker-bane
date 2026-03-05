import type { Database } from "better-sqlite3";
import { DatabaseError } from "../util/errors.js";

const MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS removal_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        broker_id TEXT NOT NULL,
        method TEXT NOT NULL CHECK (method IN ('email', 'web_form', 'hybrid')),
        status TEXT NOT NULL DEFAULT 'pending'
          CHECK (status IN (
            'pending', 'scanning', 'matched', 'sending', 'sent',
            'awaiting_confirmation', 'confirmed', 'completed',
            'failed', 'skipped', 'manual_required'
          )),
        template_used TEXT,
        email_sent_to TEXT,
        confidence_score REAL,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        screenshot_path TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_removal_requests_broker_id ON removal_requests(broker_id);
      CREATE INDEX IF NOT EXISTS idx_removal_requests_status ON removal_requests(status);

      CREATE TABLE IF NOT EXISTS broker_responses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES removal_requests(id) ON DELETE CASCADE,
        response_type TEXT NOT NULL CHECK (response_type IN (
          'confirmation', 'acknowledgment', 'rejection', 'info_request', 'unknown'
        )),
        raw_subject TEXT,
        raw_from TEXT,
        raw_body_hash TEXT NOT NULL,
        confirmation_url TEXT,
        url_domain TEXT,
        is_processed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_broker_responses_request_id ON broker_responses(request_id);

      CREATE TABLE IF NOT EXISTS pending_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES removal_requests(id) ON DELETE CASCADE,
        task_type TEXT NOT NULL CHECK (task_type IN (
          'captcha_solve', 'id_upload', 'manual_form', 'manual_confirm', 'review_match'
        )),
        description TEXT NOT NULL,
        url TEXT,
        is_completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_pending_tasks_request_id ON pending_tasks(request_id);
      CREATE INDEX IF NOT EXISTS idx_pending_tasks_completed ON pending_tasks(is_completed);

      CREATE TABLE IF NOT EXISTS email_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER NOT NULL REFERENCES removal_requests(id) ON DELETE CASCADE,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
        message_id TEXT,
        from_addr TEXT NOT NULL,
        to_addr TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_email_log_request_id ON email_log(request_id);
      CREATE INDEX IF NOT EXISTS idx_email_log_message_id ON email_log(message_id);

      CREATE TABLE IF NOT EXISTS circuit_breaker_state (
        broker_id TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half_open')),
        failure_count INTEGER NOT NULL DEFAULT 0,
        last_failure_at TEXT,
        cooldown_until TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pipeline_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        status TEXT NOT NULL DEFAULT 'running' CHECK (status IN (
          'running', 'completed', 'failed', 'interrupted'
        )),
        total_brokers INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        skipped_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      );

      INSERT INTO schema_version (version) VALUES (1);
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE IF NOT EXISTS scan_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        finished_at TEXT,
        status TEXT NOT NULL DEFAULT 'running'
          CHECK (status IN ('running','completed','failed','interrupted')),
        total_brokers INTEGER NOT NULL DEFAULT 0,
        found_count INTEGER NOT NULL DEFAULT 0,
        not_found_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS scan_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scan_run_id INTEGER NOT NULL REFERENCES scan_runs(id),
        broker_id TEXT NOT NULL,
        found INTEGER NOT NULL DEFAULT 0,
        confidence REAL,
        profile_data TEXT,
        screenshot_path TEXT,
        page_text TEXT,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_scan_results_run_id ON scan_results(scan_run_id);
      CREATE INDEX IF NOT EXISTS idx_scan_results_broker_id ON scan_results(broker_id);

      INSERT INTO schema_version (version) VALUES (2);
    `,
  },
  {
    version: 3,
    sql: `
      CREATE TABLE IF NOT EXISTS evidence_chain (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id INTEGER REFERENCES removal_requests(id),
        scan_result_id INTEGER REFERENCES scan_results(id),
        entry_type TEXT NOT NULL
          CHECK (entry_type IN ('before_scan','after_removal','re_verification','confirmation_email')),
        content_hash TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        screenshot_path TEXT,
        page_text TEXT,
        page_text_hash TEXT,
        broker_url TEXT,
        broker_id TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_evidence_chain_broker_id ON evidence_chain(broker_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_chain_request_id ON evidence_chain(request_id);
      CREATE INDEX IF NOT EXISTS idx_evidence_chain_scan_result_id ON evidence_chain(scan_result_id);

      INSERT INTO schema_version (version) VALUES (3);
    `,
  },
];

export function runMigrations(db: Database): void {
  try {
    // Ensure schema_version table exists for first run
    const hasVersionTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
      )
      .get();

    let currentVersion = 0;
    if (hasVersionTable) {
      const row = db
        .prepare("SELECT MAX(version) as version FROM schema_version")
        .get() as { version: number | null } | undefined;
      currentVersion = row?.version ?? 0;
    }

    const pending = MIGRATIONS.filter((m) => m.version > currentVersion);
    if (pending.length === 0) return;

    const migrate = db.transaction(() => {
      for (const migration of pending) {
        db.exec(migration.sql);
      }
    });

    migrate();
  } catch (err) {
    throw new DatabaseError("Migration failed", err);
  }
}
