import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../../src/db/migrations.js";
import { exportFromSqlite, importToSqlite } from "../../../src/portable/adapters/sqlite.js";
import type { PortablePayload, PortableProfile, PortableSettings } from "../../../src/portable/schema.js";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

const testProfile: PortableProfile = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  country: "US",
  aliases: [],
};

const testSettings: PortableSettings = {
  template: "gdpr" as const,
  regions: ["us"],
  tiers: [1, 2, 3],
  excluded_brokers: [],
  delay_min_ms: 5000,
  delay_max_ms: 15000,
  dry_run: false,
  verify_before_send: false,
  scan_interval_days: 30,
};

function basePayload(): PortablePayload {
  return {
    profile: testProfile,
    settings: testSettings,
    removal_requests: [],
    broker_responses: [],
    email_log: [],
    evidence_chain: [],
    pending_tasks: [],
    scan_runs: [],
    scan_results: [],
    pipeline_runs: [],
    warnings: { screenshots_excluded: true, credentials_excluded: true },
  };
}

describe("exportFromSqlite", () => {
  it("empty db returns empty arrays and correct profile", () => {
    const db = makeDb();
    const result = exportFromSqlite(db, { profile: testProfile, settings: testSettings });

    expect(result.profile).toEqual(testProfile);
    expect(result.settings).toEqual(testSettings);
    expect(result.removal_requests).toHaveLength(0);
    expect(result.broker_responses).toHaveLength(0);
    expect(result.email_log).toHaveLength(0);
    expect(result.evidence_chain).toHaveLength(0);
    expect(result.pending_tasks).toHaveLength(0);
    expect(result.scan_runs).toHaveLength(0);
    expect(result.scan_results).toHaveLength(0);
    expect(result.pipeline_runs).toHaveLength(0);
    expect(result.warnings.screenshots_excluded).toBe(true);
    expect(result.warnings.credentials_excluded).toBe(true);
  });

  it("removal requests get _export_id with rr: prefix", () => {
    const db = makeDb();
    db.prepare(
      `INSERT INTO removal_requests (broker_id, method, status, template_used, attempt_count, created_at, updated_at)
       VALUES ('spokeo', 'email', 'sent', 'gdpr', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run();

    const result = exportFromSqlite(db, { profile: testProfile, settings: testSettings });

    expect(result.removal_requests).toHaveLength(1);
    const rr = result.removal_requests[0];
    expect(rr._export_id).toMatch(/^rr:\d+$/);
    expect(rr.broker_id).toBe("spokeo");
    expect(rr.method).toBe("email");
    expect(rr.status).toBe("sent");
    expect(rr.template_used).toBe("gdpr");
    expect(rr.attempt_count).toBe(1);
  });

  it("email_log entries get _request_ref = rr:{request_id}", () => {
    const db = makeDb();
    const rrRow = db.prepare(
      `INSERT INTO removal_requests (broker_id, method, status, template_used, attempt_count, created_at, updated_at)
       VALUES ('acxiom', 'email', 'sent', 'gdpr', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run();
    const rrId = Number(rrRow.lastInsertRowid);

    db.prepare(
      `INSERT INTO email_log (request_id, direction, from_addr, to_addr, subject, status, message_id, created_at)
       VALUES (?, 'outbound', 'user@example.com', 'privacy@acxiom.com', 'Opt-out request', 'sent', '<msg1@test>', '2026-01-02T00:00:00Z')`
    ).run(rrId);

    const result = exportFromSqlite(db, { profile: testProfile, settings: testSettings });

    expect(result.email_log).toHaveLength(1);
    const el = result.email_log[0];
    expect(el._request_ref).toBe(`rr:${rrId}`);
    expect(el._export_id).toMatch(/^el:\d+$/);
    expect(el.direction).toBe("outbound");
    expect(el.message_id).toBe("<msg1@test>");
  });

  it("scan_results get _scan_run_ref pointing to the scan run", () => {
    const db = makeDb();
    const srunRow = db.prepare(
      `INSERT INTO scan_runs (started_at, status, total_brokers, found_count, not_found_count, error_count)
       VALUES ('2026-01-01T00:00:00Z', 'completed', 10, 2, 7, 1)`
    ).run();
    const srunId = Number(srunRow.lastInsertRowid);

    db.prepare(
      `INSERT INTO scan_results (scan_run_id, broker_id, found, created_at)
       VALUES (?, 'spokeo', 1, '2026-01-01T01:00:00Z')`
    ).run(srunId);

    const result = exportFromSqlite(db, { profile: testProfile, settings: testSettings });

    expect(result.scan_runs).toHaveLength(1);
    expect(result.scan_results).toHaveLength(1);
    expect(result.scan_runs[0]._export_id).toBe(`srun:${srunId}`);
    expect(result.scan_results[0]._scan_run_ref).toBe(`srun:${srunId}`);
  });
});

describe("importToSqlite — replace mode", () => {
  it("inserts all records into empty db", () => {
    const db = makeDb();
    const payload = basePayload();
    payload.removal_requests = [
      {
        _export_id: "rr:1",
        broker_id: "spokeo",
        method: "email",
        status: "sent",
        template_used: "gdpr",
        email_sent_to: "privacy@spokeo.com",
        confidence_score: 0.9,
        attempt_count: 1,
        last_error: null,
        metadata: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    payload.email_log = [
      {
        _export_id: "el:1",
        _request_ref: "rr:1",
        direction: "outbound",
        message_id: "<msg1@test>",
        from_addr: "user@example.com",
        to_addr: "privacy@spokeo.com",
        subject: "Opt-out",
        status: "sent",
        created_at: "2026-01-01T01:00:00Z",
      },
    ];

    const result = importToSqlite(db, payload, "replace");

    const rrs = db.prepare("SELECT * FROM removal_requests").all();
    const els = db.prepare("SELECT * FROM email_log").all();
    expect(rrs).toHaveLength(1);
    expect(els).toHaveLength(1);
    expect(result.added.removal_requests).toBe(1);
    expect(result.added.email_log).toBe(1);
  });

  it("clears existing data then inserts new data", () => {
    const db = makeDb();
    // Insert existing record
    db.prepare(
      `INSERT INTO removal_requests (broker_id, method, status, template_used, attempt_count, created_at, updated_at)
       VALUES ('old-broker', 'email', 'pending', 'gdpr', 0, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z')`
    ).run();
    expect((db.prepare("SELECT * FROM removal_requests").all() as unknown[]).length).toBe(1);

    const payload = basePayload();
    payload.removal_requests = [
      {
        _export_id: "rr:99",
        broker_id: "new-broker",
        method: "email",
        status: "sent",
        template_used: "gdpr",
        email_sent_to: null,
        confidence_score: null,
        attempt_count: 1,
        last_error: null,
        metadata: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    importToSqlite(db, payload, "replace");

    const rrs = db.prepare("SELECT * FROM removal_requests").all() as Array<{ broker_id: string }>;
    expect(rrs).toHaveLength(1);
    expect(rrs[0].broker_id).toBe("new-broker");
  });
});

describe("importToSqlite — merge mode", () => {
  it("skips duplicate removal_requests (same broker_id + created_at)", () => {
    const db = makeDb();
    // Pre-insert a record
    db.prepare(
      `INSERT INTO removal_requests (broker_id, method, status, template_used, attempt_count, created_at, updated_at)
       VALUES ('spokeo', 'email', 'sent', 'gdpr', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run();

    const payload = basePayload();
    payload.removal_requests = [
      {
        _export_id: "rr:1",
        broker_id: "spokeo",
        method: "email",
        status: "sent",
        template_used: "gdpr",
        email_sent_to: null,
        confidence_score: null,
        attempt_count: 1,
        last_error: null,
        metadata: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    const result = importToSqlite(db, payload, "merge");

    const rrs = db.prepare("SELECT * FROM removal_requests").all();
    expect(rrs).toHaveLength(1); // still only 1 — duplicate skipped
    expect(result.added.removal_requests).toBe(0);
    expect(result.skipped.removal_requests).toBe(1);
  });

  it("adds new records alongside existing ones", () => {
    const db = makeDb();
    // Pre-insert one record
    db.prepare(
      `INSERT INTO removal_requests (broker_id, method, status, template_used, attempt_count, created_at, updated_at)
       VALUES ('acxiom', 'email', 'sent', 'gdpr', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`
    ).run();

    const payload = basePayload();
    payload.removal_requests = [
      {
        _export_id: "rr:1",
        broker_id: "acxiom",
        method: "email",
        status: "sent",
        template_used: "gdpr",
        email_sent_to: null,
        confidence_score: null,
        attempt_count: 1,
        last_error: null,
        metadata: null,
        created_at: "2026-01-01T00:00:00Z", // same — duplicate
        updated_at: "2026-01-01T00:00:00Z",
      },
      {
        _export_id: "rr:2",
        broker_id: "spokeo",
        method: "email",
        status: "pending",
        template_used: "gdpr",
        email_sent_to: null,
        confidence_score: null,
        attempt_count: 0,
        last_error: null,
        metadata: null,
        created_at: "2026-02-01T00:00:00Z", // different — new
        updated_at: "2026-02-01T00:00:00Z",
      },
    ];

    const result = importToSqlite(db, payload, "merge");

    const rrs = db.prepare("SELECT * FROM removal_requests").all() as Array<{ broker_id: string }>;
    expect(rrs).toHaveLength(2); // existing + 1 new
    expect(rrs.map((r) => r.broker_id).sort()).toEqual(["acxiom", "spokeo"]);
    expect(result.added.removal_requests).toBe(1);
    expect(result.skipped.removal_requests).toBe(1);
  });
});
