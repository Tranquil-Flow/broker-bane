import type { Database } from "better-sqlite3";
import type {
  PortablePayload,
  PortableSettings,
  PortableProfile,
} from "../schema.js";
import type {
  RemovalRequestRow,
  BrokerResponseRow,
  EmailLogRow,
  EvidenceChainRow,
  PendingTaskRow,
  ScanRunRow,
  ScanResultRow,
  PipelineRunRow,
} from "../../types/database.js";

export interface ExportOptions {
  profile: PortableProfile;
  settings: PortableSettings;
}

export interface AdapterImportResult {
  added: Record<string, number>;
  skipped: Record<string, number>;
  credentialsNeeded: boolean;
}

export function exportFromSqlite(
  db: Database,
  options: ExportOptions
): PortablePayload {
  const rrs = db
    .prepare("SELECT * FROM removal_requests ORDER BY id")
    .all() as RemovalRequestRow[];
  const brs = db
    .prepare("SELECT * FROM broker_responses ORDER BY id")
    .all() as BrokerResponseRow[];
  const els = db
    .prepare("SELECT * FROM email_log ORDER BY id")
    .all() as EmailLogRow[];
  const ecs = db
    .prepare("SELECT * FROM evidence_chain ORDER BY id")
    .all() as EvidenceChainRow[];
  const pts = db
    .prepare("SELECT * FROM pending_tasks ORDER BY id")
    .all() as PendingTaskRow[];
  const sruns = db
    .prepare("SELECT * FROM scan_runs ORDER BY id")
    .all() as ScanRunRow[];
  const sres = db
    .prepare("SELECT * FROM scan_results ORDER BY id")
    .all() as ScanResultRow[];
  const pruns = db
    .prepare("SELECT * FROM pipeline_runs ORDER BY id")
    .all() as PipelineRunRow[];

  // Build export-ID maps for FK resolution
  const rrMap = new Map(rrs.map((r) => [r.id, `rr:${r.id}`]));
  const srunMap = new Map(sruns.map((r) => [r.id, `srun:${r.id}`]));
  const sresMap = new Map(sres.map((r) => [r.id, `sres:${r.id}`]));

  return {
    profile: options.profile,
    settings: options.settings,
    removal_requests: rrs.map((r) => ({
      _export_id: `rr:${r.id}`,
      broker_id: r.broker_id,
      method: r.method,
      status: r.status,
      template_used: r.template_used ?? "",
      email_sent_to: r.email_sent_to ?? null,
      confidence_score: r.confidence_score ?? null,
      attempt_count: r.attempt_count ?? 0,
      last_error: r.last_error ?? null,
      metadata: r.metadata ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    broker_responses: brs.map((r) => ({
      _export_id: `br:${r.id}`,
      _request_ref: rrMap.get(r.request_id) ?? `rr:${r.request_id}`,
      response_type: r.response_type,
      raw_subject: r.raw_subject ?? null,
      raw_from: r.raw_from ?? null,
      raw_body_hash: r.raw_body_hash,
      confirmation_url: r.confirmation_url ?? null,
      url_domain: r.url_domain ?? null,
      is_processed: Boolean(r.is_processed),
      created_at: r.created_at,
    })),
    email_log: els.map((r) => ({
      _export_id: `el:${r.id}`,
      _request_ref: rrMap.get(r.request_id) ?? `rr:${r.request_id}`,
      direction: r.direction,
      message_id: r.message_id ?? null,
      from_addr: r.from_addr,
      to_addr: r.to_addr,
      subject: r.subject,
      status: r.status,
      created_at: r.created_at,
    })),
    evidence_chain: ecs.map((r) => ({
      _export_id: `ec:${r.id}`,
      _request_ref:
        r.request_id != null
          ? (rrMap.get(r.request_id) ?? `rr:${r.request_id}`)
          : null,
      _scan_result_ref:
        r.scan_result_id != null
          ? (sresMap.get(r.scan_result_id) ?? `sres:${r.scan_result_id}`)
          : null,
      broker_id: r.broker_id,
      entry_type: r.entry_type,
      content_hash: r.content_hash,
      prev_hash: r.prev_hash,
      page_text_hash: r.page_text_hash ?? null,
      broker_url: r.broker_url ?? null,
      metadata: r.metadata ?? null,
      created_at: r.created_at,
    })),
    pending_tasks: pts.map((r) => ({
      _export_id: `pt:${r.id}`,
      _request_ref: rrMap.get(r.request_id) ?? `rr:${r.request_id}`,
      task_type: r.task_type,
      description: r.description,
      url: r.url ?? null,
      is_completed: Boolean(r.is_completed),
      created_at: r.created_at,
      completed_at: r.completed_at ?? null,
    })),
    scan_runs: sruns.map((r) => ({
      _export_id: `srun:${r.id}`,
      started_at: r.started_at,
      finished_at: r.finished_at ?? null,
      status: r.status,
      total_brokers: r.total_brokers ?? 0,
      found_count: r.found_count ?? 0,
      not_found_count: r.not_found_count ?? 0,
      error_count: r.error_count ?? 0,
    })),
    scan_results: sres.map((r) => ({
      _export_id: `sres:${r.id}`,
      _scan_run_ref: srunMap.get(r.scan_run_id) ?? `srun:${r.scan_run_id}`,
      broker_id: r.broker_id,
      found: Boolean(r.found),
      confidence: r.confidence ?? null,
      profile_data: r.profile_data ?? null,
      error: r.error ?? null,
      created_at: r.created_at,
    })),
    pipeline_runs: pruns.map((r) => ({
      _export_id: `prun:${r.id}`,
      started_at: r.started_at,
      finished_at: r.finished_at ?? null,
      status: r.status,
      total_brokers: r.total_brokers ?? 0,
      sent_count: r.sent_count ?? 0,
      failed_count: r.failed_count ?? 0,
      skipped_count: r.skipped_count ?? 0,
    })),
    warnings: { screenshots_excluded: true, credentials_excluded: true },
  };
}

export function importToSqlite(
  db: Database,
  payload: PortablePayload,
  mode: "replace" | "merge"
): AdapterImportResult {
  if (mode === "replace") {
    return replaceAll(db, payload);
  }
  return mergeNew(db, payload);
}

// ---------------------------------------------------------------------------
// replace mode
// ---------------------------------------------------------------------------

function replaceAll(
  db: Database,
  payload: PortablePayload
): AdapterImportResult {
  const added: Record<string, number> = {};

  db.transaction(() => {
    // Delete children before parents (FK cascade would also work, but be explicit)
    db.prepare("DELETE FROM evidence_chain").run();
    db.prepare("DELETE FROM pending_tasks").run();
    db.prepare("DELETE FROM email_log").run();
    db.prepare("DELETE FROM broker_responses").run();
    db.prepare("DELETE FROM scan_results").run();
    db.prepare("DELETE FROM scan_runs").run();
    db.prepare("DELETE FROM pipeline_runs").run();
    db.prepare("DELETE FROM removal_requests").run();

    const rrIdMap = insertRemovalRequests(db, payload.removal_requests);
    added.removal_requests = payload.removal_requests.length;

    insertBrokerResponses(db, payload.broker_responses, rrIdMap);
    added.broker_responses = payload.broker_responses.length;

    insertEmailLog(db, payload.email_log, rrIdMap);
    added.email_log = payload.email_log.length;

    insertPendingTasks(db, payload.pending_tasks, rrIdMap);
    added.pending_tasks = payload.pending_tasks.length;

    const srunIdMap = insertScanRuns(db, payload.scan_runs);
    added.scan_runs = payload.scan_runs.length;

    const sresIdMap = insertScanResults(db, payload.scan_results, srunIdMap);
    added.scan_results = payload.scan_results.length;

    insertEvidenceChain(db, payload.evidence_chain, rrIdMap, sresIdMap);
    added.evidence_chain = payload.evidence_chain.length;

    insertPipelineRuns(db, payload.pipeline_runs);
    added.pipeline_runs = payload.pipeline_runs.length;
  })();

  return { added, skipped: {}, credentialsNeeded: true };
}

// ---------------------------------------------------------------------------
// merge mode
// ---------------------------------------------------------------------------

function mergeNew(
  db: Database,
  incoming: PortablePayload
): AdapterImportResult {
  // Export what's already in the DB so we can deduplicate
  const existing = exportFromSqlite(db, {
    profile: incoming.profile,
    settings: incoming.settings,
  });

  // --- compute skipped counts using the same keys as diff.ts ---
  const skipped: Record<string, number> = {};

  const existingRRKeys = new Set(
    existing.removal_requests.map((r) => `${r.broker_id}|${r.created_at}`)
  );
  const newRRs = incoming.removal_requests.filter(
    (r) => !existingRRKeys.has(`${r.broker_id}|${r.created_at}`)
  );
  skipped.removal_requests =
    incoming.removal_requests.length - newRRs.length;

  const existingMsgIds = new Set(
    existing.email_log
      .filter((e) => e.message_id != null)
      .map((e) => e.message_id!)
  );
  const newELs = incoming.email_log.filter(
    (e) => e.message_id == null || !existingMsgIds.has(e.message_id)
  );
  skipped.email_log = incoming.email_log.length - newELs.length;

  const newBRs = filterNew(
    incoming.broker_responses,
    existing.broker_responses,
    (r) => `${r._request_ref}|${r.response_type}|${r.created_at}`
  );
  skipped.broker_responses = incoming.broker_responses.length - newBRs.length;

  const newECs = filterNew(
    incoming.evidence_chain,
    existing.evidence_chain,
    (r) => `${r.broker_id}|${r.entry_type}|${r.created_at}`
  );
  skipped.evidence_chain = incoming.evidence_chain.length - newECs.length;

  const newPTs = filterNew(
    incoming.pending_tasks,
    existing.pending_tasks,
    (r) => `${r._request_ref}|${r.task_type}|${r.created_at}`
  );
  skipped.pending_tasks = incoming.pending_tasks.length - newPTs.length;

  const newSRuns = filterNew(
    incoming.scan_runs,
    existing.scan_runs,
    (r) => `${r.started_at}|${r.status}`
  );
  skipped.scan_runs = incoming.scan_runs.length - newSRuns.length;

  const newSRes = filterNew(
    incoming.scan_results,
    existing.scan_results,
    (r) => `${r.broker_id}|${r.created_at}`
  );
  skipped.scan_results = incoming.scan_results.length - newSRes.length;

  const newPRuns = filterNew(
    incoming.pipeline_runs,
    existing.pipeline_runs,
    (r) => `${r.started_at}|${r.status}`
  );
  skipped.pipeline_runs = incoming.pipeline_runs.length - newPRuns.length;

  const added: Record<string, number> = {};

  // Build a lookup from existing export_ids to real DB ids so child
  // records referencing already-present parents can still be inserted.
  const existingRRIdMap = buildExistingRRIdMap(db);

  db.transaction(() => {
    // Insert new removal_requests; also populate a combined map with
    // existing ones so cross-refs resolve correctly.
    const rrIdMap = new Map<string, number>();

    // Map existing export_ids → DB ids
    for (const exRR of existing.removal_requests) {
      const dbId = existingRRIdMap.get(`${exRR.broker_id}|${exRR.created_at}`);
      if (dbId != null) rrIdMap.set(exRR._export_id, dbId);
    }

    // Insert new ones
    const newRRIdMap = insertRemovalRequests(db, newRRs);
    for (const [exportId, dbId] of newRRIdMap) {
      rrIdMap.set(exportId, dbId);
    }
    added.removal_requests = newRRs.length;

    insertBrokerResponses(db, newBRs, rrIdMap);
    added.broker_responses = newBRs.length;

    insertEmailLog(db, newELs, rrIdMap);
    added.email_log = newELs.length;

    insertPendingTasks(db, newPTs, rrIdMap);
    added.pending_tasks = newPTs.length;

    // scan_runs
    const srunIdMap = new Map<string, number>();
    // Map existing export_ids
    const existingSRunIds = buildExistingSRunIdMap(db, existing);
    for (const [exportId, dbId] of existingSRunIds) {
      srunIdMap.set(exportId, dbId);
    }
    const newSRunIdMap = insertScanRuns(db, newSRuns);
    for (const [exportId, dbId] of newSRunIdMap) {
      srunIdMap.set(exportId, dbId);
    }
    added.scan_runs = newSRuns.length;

    // scan_results — may reference existing or new scan_runs
    const sresIdMap = new Map<string, number>();
    const existingSResIds = buildExistingSResIdMap(db, existing);
    for (const [exportId, dbId] of existingSResIds) {
      sresIdMap.set(exportId, dbId);
    }
    const newSResIdMap = insertScanResults(db, newSRes, srunIdMap);
    for (const [exportId, dbId] of newSResIdMap) {
      sresIdMap.set(exportId, dbId);
    }
    added.scan_results = newSRes.length;

    insertEvidenceChain(db, newECs, rrIdMap, sresIdMap);
    added.evidence_chain = newECs.length;

    insertPipelineRuns(db, newPRuns);
    added.pipeline_runs = newPRuns.length;
  })();

  return { added, skipped, credentialsNeeded: false };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function filterNew<T>(
  incoming: T[],
  existing: T[],
  key: (r: T) => string
): T[] {
  const existingKeys = new Set(existing.map(key));
  return incoming.filter((r) => !existingKeys.has(key(r)));
}

function buildExistingRRIdMap(
  db: Database
): Map<string, number> {
  const rows = db
    .prepare("SELECT id, broker_id, created_at FROM removal_requests")
    .all() as Array<{ id: number; broker_id: string; created_at: string }>;
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(`${r.broker_id}|${r.created_at}`, r.id);
  }
  return map;
}

function buildExistingSRunIdMap(
  db: Database,
  existing: PortablePayload
): Map<string, number> {
  const rows = db
    .prepare("SELECT id, started_at, status FROM scan_runs")
    .all() as Array<{ id: number; started_at: string; status: string }>;
  const byKey = new Map(rows.map((r) => [`${r.started_at}|${r.status}`, r.id]));
  const map = new Map<string, number>();
  for (const ex of existing.scan_runs) {
    const dbId = byKey.get(`${ex.started_at}|${ex.status}`);
    if (dbId != null) map.set(ex._export_id, dbId);
  }
  return map;
}

function buildExistingSResIdMap(
  db: Database,
  existing: PortablePayload
): Map<string, number> {
  const rows = db
    .prepare("SELECT id, broker_id, created_at FROM scan_results")
    .all() as Array<{ id: number; broker_id: string; created_at: string }>;
  const byKey = new Map(rows.map((r) => [`${r.broker_id}|${r.created_at}`, r.id]));
  const map = new Map<string, number>();
  for (const ex of existing.scan_results) {
    const dbId = byKey.get(`${ex.broker_id}|${ex.created_at}`);
    if (dbId != null) map.set(ex._export_id, dbId);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Insert helpers — return export_id → new DB id maps where needed
// ---------------------------------------------------------------------------

type PortableRemovalRequest = PortablePayload["removal_requests"][0];
type PortableBrokerResponse = PortablePayload["broker_responses"][0];
type PortableEmailLog = PortablePayload["email_log"][0];
type PortableEvidenceChain = PortablePayload["evidence_chain"][0];
type PortablePendingTask = PortablePayload["pending_tasks"][0];
type PortableScanRun = PortablePayload["scan_runs"][0];
type PortableScanResult = PortablePayload["scan_results"][0];
type PortablePipelineRun = PortablePayload["pipeline_runs"][0];

function insertRemovalRequests(
  db: Database,
  records: PortableRemovalRequest[]
): Map<string, number> {
  const stmt = db.prepare(`
    INSERT INTO removal_requests
      (broker_id, method, status, template_used, email_sent_to,
       confidence_score, attempt_count, last_error, metadata,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const idMap = new Map<string, number>();
  for (const rr of records) {
    const r = stmt.run(
      rr.broker_id,
      rr.method,
      rr.status,
      rr.template_used,
      rr.email_sent_to,
      rr.confidence_score,
      rr.attempt_count,
      rr.last_error,
      rr.metadata,
      rr.created_at,
      rr.updated_at
    );
    idMap.set(rr._export_id, Number(r.lastInsertRowid));
  }
  return idMap;
}

function insertBrokerResponses(
  db: Database,
  records: PortableBrokerResponse[],
  rrIdMap: Map<string, number>
): void {
  const stmt = db.prepare(`
    INSERT INTO broker_responses
      (request_id, response_type, raw_subject, raw_from, raw_body_hash,
       confirmation_url, url_domain, is_processed, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const br of records) {
    const requestId = rrIdMap.get(br._request_ref);
    if (requestId == null) continue;
    stmt.run(
      requestId,
      br.response_type,
      br.raw_subject,
      br.raw_from,
      br.raw_body_hash,
      br.confirmation_url,
      br.url_domain,
      br.is_processed ? 1 : 0,
      br.created_at
    );
  }
}

function insertEmailLog(
  db: Database,
  records: PortableEmailLog[],
  rrIdMap: Map<string, number>
): void {
  const stmt = db.prepare(`
    INSERT INTO email_log
      (request_id, direction, message_id, from_addr, to_addr, subject, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const el of records) {
    const requestId = rrIdMap.get(el._request_ref);
    if (requestId == null) continue;
    stmt.run(
      requestId,
      el.direction,
      el.message_id,
      el.from_addr,
      el.to_addr,
      el.subject,
      el.status,
      el.created_at
    );
  }
}

function insertPendingTasks(
  db: Database,
  records: PortablePendingTask[],
  rrIdMap: Map<string, number>
): void {
  const stmt = db.prepare(`
    INSERT INTO pending_tasks
      (request_id, task_type, description, url, is_completed, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const pt of records) {
    const requestId = rrIdMap.get(pt._request_ref);
    if (requestId == null) continue;
    stmt.run(
      requestId,
      pt.task_type,
      pt.description,
      pt.url,
      pt.is_completed ? 1 : 0,
      pt.created_at,
      pt.completed_at
    );
  }
}

function insertScanRuns(
  db: Database,
  records: PortableScanRun[]
): Map<string, number> {
  const stmt = db.prepare(`
    INSERT INTO scan_runs
      (started_at, finished_at, status, total_brokers, found_count, not_found_count, error_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const idMap = new Map<string, number>();
  for (const sr of records) {
    const r = stmt.run(
      sr.started_at,
      sr.finished_at,
      sr.status,
      sr.total_brokers,
      sr.found_count,
      sr.not_found_count,
      sr.error_count
    );
    idMap.set(sr._export_id, Number(r.lastInsertRowid));
  }
  return idMap;
}

function insertScanResults(
  db: Database,
  records: PortableScanResult[],
  srunIdMap: Map<string, number>
): Map<string, number> {
  const stmt = db.prepare(`
    INSERT INTO scan_results
      (scan_run_id, broker_id, found, confidence, profile_data, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const idMap = new Map<string, number>();
  for (const sres of records) {
    const scanRunId = srunIdMap.get(sres._scan_run_ref);
    if (scanRunId == null) continue;
    const r = stmt.run(
      scanRunId,
      sres.broker_id,
      sres.found ? 1 : 0,
      sres.confidence,
      sres.profile_data,
      sres.error,
      sres.created_at
    );
    idMap.set(sres._export_id, Number(r.lastInsertRowid));
  }
  return idMap;
}

function insertEvidenceChain(
  db: Database,
  records: PortableEvidenceChain[],
  rrIdMap: Map<string, number>,
  sresIdMap: Map<string, number>
): void {
  const stmt = db.prepare(`
    INSERT INTO evidence_chain
      (request_id, scan_result_id, broker_id, entry_type, content_hash,
       prev_hash, page_text_hash, broker_url, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const ec of records) {
    const requestId = ec._request_ref ? (rrIdMap.get(ec._request_ref) ?? null) : null;
    const scanResultId = ec._scan_result_ref
      ? (sresIdMap.get(ec._scan_result_ref) ?? null)
      : null;
    stmt.run(
      requestId,
      scanResultId,
      ec.broker_id,
      ec.entry_type,
      ec.content_hash,
      ec.prev_hash,
      ec.page_text_hash,
      ec.broker_url,
      ec.metadata,
      ec.created_at
    );
  }
}

function insertPipelineRuns(
  db: Database,
  records: PortablePipelineRun[]
): void {
  const stmt = db.prepare(`
    INSERT INTO pipeline_runs
      (started_at, finished_at, status, total_brokers, sent_count, failed_count, skipped_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const pr of records) {
    stmt.run(
      pr.started_at,
      pr.finished_at,
      pr.status,
      pr.total_brokers,
      pr.sent_count,
      pr.failed_count,
      pr.skipped_count
    );
  }
}
