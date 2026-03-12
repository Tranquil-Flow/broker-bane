import { describe, it, expect } from "vitest";
import { validate } from "../../../src/portable/validate.js";
import type { PortablePayload } from "../../../src/portable/schema.js";

function basePayload(): PortablePayload {
  return {
    profile: { first_name: "Jane", last_name: "Doe", email: "jane@example.com", country: "US", aliases: [] },
    settings: { template: "gdpr", regions: ["us"], tiers: [1, 2, 3], excluded_brokers: [], delay_min_ms: 5000, delay_max_ms: 15000, dry_run: false, verify_before_send: false, scan_interval_days: 30 },
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

describe("validate", () => {
  it("returns valid: true for an empty clean payload", () => {
    const result = validate(basePayload(), new Set(["spokeo", "beenverified"]));
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("warns about unknown broker IDs", () => {
    const payload = basePayload();
    payload.removal_requests = [{
      _export_id: "rr:1", broker_id: "unknown-broker-xyz", method: "email", status: "sent",
      template_used: "gdpr", email_sent_to: null, confidence_score: null, attempt_count: 1,
      last_error: null, metadata: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z"
    }];
    const result = validate(payload, new Set(["spokeo", "beenverified"]));
    const warning = result.warnings.find(w => w.type === "unknown_broker");
    expect(warning).toBeDefined();
    expect(warning!.count).toBe(1);
  });

  it("does not warn about known broker IDs", () => {
    const payload = basePayload();
    payload.removal_requests = [{
      _export_id: "rr:1", broker_id: "spokeo", method: "email", status: "sent",
      template_used: "gdpr", email_sent_to: null, confidence_score: null, attempt_count: 1,
      last_error: null, metadata: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z"
    }];
    const result = validate(payload, new Set(["spokeo", "beenverified"]));
    const warning = result.warnings.find(w => w.type === "unknown_broker");
    expect(warning).toBeUndefined();
  });

  it("warns about orphaned _request_ref in email_log", () => {
    const payload = basePayload();
    payload.email_log = [{
      _export_id: "el:1", _request_ref: "rr:NONEXISTENT", direction: "out",
      message_id: null, from_addr: "a@b.com", to_addr: "c@d.com",
      subject: "Opt-out", status: "sent", created_at: "2026-01-01T00:00:00Z"
    }];
    const result = validate(payload, new Set());
    const warning = result.warnings.find(w => w.type === "orphaned_reference");
    expect(warning).toBeDefined();
    expect(warning!.count).toBe(1);
  });

  it("warns about orphaned _scan_run_ref in scan_results", () => {
    const payload = basePayload();
    payload.scan_results = [{
      _export_id: "sr:1", _scan_run_ref: "srun:NONEXISTENT", broker_id: "spokeo",
      found: true, confidence: 0.9, profile_data: null, error: null,
      created_at: "2026-01-01T00:00:00Z"
    }];
    const result = validate(payload, new Set(["spokeo"]));
    const warning = result.warnings.find(w => w.type === "orphaned_reference");
    expect(warning).toBeDefined();
  });

  it("warns about future dates", () => {
    const payload = basePayload();
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    payload.removal_requests = [{
      _export_id: "rr:1", broker_id: "spokeo", method: "email", status: "sent",
      template_used: "gdpr", email_sent_to: null, confidence_score: null, attempt_count: 1,
      last_error: null, metadata: null, created_at: futureDate, updated_at: futureDate
    }];
    const result = validate(payload, new Set(["spokeo"]));
    const warning = result.warnings.find(w => w.type === "future_date");
    expect(warning).toBeDefined();
  });

  it("warns about duplicate _export_ids", () => {
    const payload = basePayload();
    const rr = {
      _export_id: "rr:1", broker_id: "spokeo", method: "email", status: "sent",
      template_used: "gdpr", email_sent_to: null, confidence_score: null, attempt_count: 1,
      last_error: null, metadata: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z"
    };
    payload.removal_requests = [rr, { ...rr }]; // duplicate _export_id
    const result = validate(payload, new Set(["spokeo"]));
    const warning = result.warnings.find(w => w.type === "duplicate_entry");
    expect(warning).toBeDefined();
  });
});
