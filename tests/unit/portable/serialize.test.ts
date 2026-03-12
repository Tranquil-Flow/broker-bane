// tests/unit/portable/serialize.test.ts
import { describe, it, expect } from "vitest";
import { serialize } from "../../../src/portable/serialize.js";
import { deserialize, readEnvelope } from "../../../src/portable/deserialize.js";
import type { PortablePayload } from "../../../src/portable/schema.js";

function makePayload(): PortablePayload {
  return {
    profile: {
      first_name: "Jane", last_name: "Doe", email: "jane@example.com",
      country: "US", aliases: [],
    },
    settings: {
      template: "gdpr", regions: ["us"], tiers: [1, 2, 3],
      excluded_brokers: [], delay_min_ms: 5000, delay_max_ms: 15000,
      dry_run: false, verify_before_send: false, scan_interval_days: 30,
    },
    removal_requests: [{
      _export_id: "rr:1", broker_id: "spokeo", method: "email", status: "sent",
      template_used: "gdpr", email_sent_to: "privacy@spokeo.com",
      confidence_score: null, attempt_count: 1, last_error: null,
      metadata: null, created_at: "2026-03-10T22:14:00Z", updated_at: "2026-03-10T22:14:05Z",
    }],
    broker_responses: [], email_log: [], evidence_chain: [],
    pending_tasks: [], scan_runs: [], scan_results: [], pipeline_runs: [],
    warnings: { screenshots_excluded: true, credentials_excluded: true },
  };
}

describe("serialize + deserialize", () => {
  it("round-trips a payload through encrypt/decrypt", async () => {
    const payload = makePayload();
    const json = await serialize(payload, "test-pass-12345", { source: "cli", appVersion: "0.1.0" });
    const result = await deserialize(json, "test-pass-12345");
    expect(result.profile.first_name).toBe("Jane");
    expect(result.removal_requests).toHaveLength(1);
    expect(result.removal_requests[0].broker_id).toBe("spokeo");
  });

  it("rejects wrong passphrase", async () => {
    const payload = makePayload();
    const json = await serialize(payload, "correct-pass-long", { source: "cli", appVersion: "0.1.0" });
    await expect(deserialize(json, "wrong-pass-long")).rejects.toThrow();
  });

  it("rejects corrupted checksum", async () => {
    const payload = makePayload();
    const json = await serialize(payload, "test-pass-12345", { source: "cli", appVersion: "0.1.0" });
    const envelope = JSON.parse(json);
    envelope.crypto.checksum = "0000000000000000000000000000000000000000000000000000000000000000";
    await expect(deserialize(JSON.stringify(envelope), "test-pass-12345")).rejects.toThrow(/checksum/i);
  });

  it("rejects passphrase shorter than 8 characters", async () => {
    const payload = makePayload();
    await expect(serialize(payload, "short", { source: "cli", appVersion: "0.1.0" })).rejects.toThrow(/8 char/i);
  });

  it("includes exclusions when specified", async () => {
    const payload = makePayload();
    payload.email_log = [{
      _export_id: "el:1", _request_ref: "rr:1", direction: "out",
      message_id: "<abc@test>", from_addr: "jane@example.com", to_addr: "privacy@spokeo.com",
      subject: "Opt-out request", status: "sent", created_at: "2026-03-10T22:14:00Z"
    }];
    const json = await serialize(payload, "test-pass-12345", {
      source: "cli", appVersion: "0.1.0", exclude: ["email_log"]
    });
    const result = await deserialize(json, "test-pass-12345");
    expect(result.email_log).toHaveLength(0);
  });
});

describe("readEnvelope", () => {
  it("reads envelope without passphrase", async () => {
    const payload = makePayload();
    const json = await serialize(payload, "test-pass-12345", { source: "cli", appVersion: "0.1.0" });
    const envelope = readEnvelope(json);
    expect(envelope.format).toBe("brokerbane-export");
    expect(envelope.version).toBe(1);
    expect(envelope.source).toBe("cli");
    expect(envelope.summary.removal_requests).toBe(1);
  });
});
