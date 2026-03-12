import { describe, it, expect } from "vitest";
import { diff } from "../../../src/portable/diff.js";
import type { PortablePayload } from "../../../src/portable/schema.js";

function basePayload(): PortablePayload {
  return {
    profile: { first_name: "Jane", last_name: "Doe", email: "jane@example.com", country: "US", aliases: [] },
    settings: { template: "gdpr", regions: ["us"], tiers: [1, 2, 3], excluded_brokers: [], delay_min_ms: 5000, delay_max_ms: 15000, dry_run: false, verify_before_send: false, scan_interval_days: 30 },
    removal_requests: [], broker_responses: [], email_log: [], evidence_chain: [],
    pending_tasks: [], scan_runs: [], scan_results: [], pipeline_runs: [],
    warnings: { screenshots_excluded: true, credentials_excluded: true },
  };
}

const rrBase = {
  _export_id: "rr:1", broker_id: "spokeo", method: "email", status: "sent",
  template_used: "gdpr", email_sent_to: null, confidence_score: null, attempt_count: 1,
  last_error: null, metadata: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z"
};

describe("diff", () => {
  it("returns all zero counts when payloads are identical", () => {
    const p = basePayload();
    p.removal_requests = [rrBase];
    const result = diff(p, p);
    expect(result.added.removal_requests).toBe(0);
    expect(result.skipped.removal_requests).toBe(1);
    expect(result.conflicts).toHaveLength(0);
  });

  it("counts new removal requests as added", () => {
    const incoming = basePayload();
    incoming.removal_requests = [rrBase];
    const existing = basePayload();
    const result = diff(incoming, existing);
    expect(result.added.removal_requests).toBe(1);
    expect(result.skipped.removal_requests).toBe(0);
  });

  it("detects profile field conflicts", () => {
    const incoming = basePayload();
    incoming.profile.first_name = "Janet";
    const existing = basePayload(); // first_name = "Jane"
    const result = diff(incoming, existing);
    const conflict = result.conflicts.find(c => c.field === "first_name");
    expect(conflict).toBeDefined();
    expect(conflict!.currentValue).toBe("Jane");
    expect(conflict!.importedValue).toBe("Janet");
  });

  it("matches email_log by message_id", () => {
    const el = {
      _export_id: "el:1", _request_ref: "rr:1", direction: "out" as const,
      message_id: "<abc@test>", from_addr: "a@b.com", to_addr: "c@d.com",
      subject: "Opt-out", status: "sent", created_at: "2026-01-01T00:00:00Z"
    };
    const incoming = basePayload();
    incoming.email_log = [el];
    const existing = basePayload();
    existing.email_log = [el]; // same message_id
    const result = diff(incoming, existing);
    expect(result.added.email_log).toBe(0);
    expect(result.skipped.email_log).toBe(1);
  });

  it("adds email_log without message_id as new", () => {
    const el = {
      _export_id: "el:1", _request_ref: "rr:1", direction: "out" as const,
      message_id: null, from_addr: "a@b.com", to_addr: "c@d.com",
      subject: "Opt-out", status: "sent", created_at: "2026-01-01T00:00:00Z"
    };
    const incoming = basePayload();
    incoming.email_log = [el];
    const existing = basePayload();
    const result = diff(incoming, existing);
    expect(result.added.email_log).toBe(1);
  });

  it("does not flag profile conflict when field is empty in existing", () => {
    const incoming = basePayload();
    incoming.profile.phone = "555-1234";
    const existing = basePayload(); // no phone
    const result = diff(incoming, existing);
    const conflict = result.conflicts.find(c => c.field === "phone");
    expect(conflict).toBeUndefined(); // no conflict — existing is empty
  });
});
