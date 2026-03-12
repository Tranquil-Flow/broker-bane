import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { exportFromSqlite, importToSqlite } from "../../src/portable/adapters/sqlite.js";
import { serialize } from "../../src/portable/serialize.js";
import { deserialize } from "../../src/portable/deserialize.js";
import type { PortableProfile, PortableSettings } from "../../src/portable/schema.js";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

const testProfile: PortableProfile = {
  first_name: "Jane", last_name: "Doe", email: "jane@example.com",
  country: "US", aliases: [],
};

const testSettings: PortableSettings = {
  template: "gdpr", regions: ["us"], tiers: [1, 2, 3],
  excluded_brokers: [], delay_min_ms: 5000, delay_max_ms: 15000,
  dry_run: false, verify_before_send: false, scan_interval_days: 30,
};

describe("Portable import/export integration", () => {
  it("round-trips serialize/deserialize through full stack", async () => {
    const db = makeDb();
    const rrRepo = new RemovalRequestRepo(db);
    rrRepo.create({ brokerId: "spokeo", method: "email", templateUsed: "gdpr", emailSentTo: "privacy@spokeo.com" });

    const payload = exportFromSqlite(db, { profile: testProfile, settings: testSettings });
    const json = await serialize(payload, "test-passphrase-abc", { source: "cli", appVersion: "0.1.0" });
    const deserialized = await deserialize(json, "test-passphrase-abc");

    expect(deserialized.removal_requests).toHaveLength(1);
    expect(deserialized.removal_requests[0].broker_id).toBe("spokeo");
    expect(deserialized.profile.first_name).toBe("Jane");
  });

  it("replace mode restores all data into a fresh database", async () => {
    const sourceDb = makeDb();
    const rrRepo = new RemovalRequestRepo(sourceDb);
    rrRepo.create({ brokerId: "spokeo", method: "email" });
    rrRepo.create({ brokerId: "beenverified", method: "email" });

    const payload = exportFromSqlite(sourceDb, { profile: testProfile, settings: testSettings });

    const targetDb = makeDb();
    importToSqlite(targetDb, payload, "replace");

    const targetRRs = targetDb.prepare("SELECT * FROM removal_requests").all();
    expect(targetRRs).toHaveLength(2);
  });

  it("replace mode clears existing data before import", async () => {
    const db = makeDb();
    const rrRepo = new RemovalRequestRepo(db);
    rrRepo.create({ brokerId: "acxiom", method: "email" });

    const payload = exportFromSqlite(db, { profile: testProfile, settings: testSettings });

    // Add more data
    rrRepo.create({ brokerId: "spokeo", method: "email" });
    expect(db.prepare("SELECT COUNT(*) as c FROM removal_requests").get()).toMatchObject({ c: 2 });

    // Import with replace — should end up with original 1 record
    importToSqlite(db, payload, "replace");

    const count = db.prepare("SELECT COUNT(*) as c FROM removal_requests").get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("merge mode skips duplicate records", async () => {
    const db = makeDb();
    const rrRepo = new RemovalRequestRepo(db);
    rrRepo.create({ brokerId: "spokeo", method: "email" });

    const payload = exportFromSqlite(db, { profile: testProfile, settings: testSettings });

    // Import same data again in merge mode
    const result = importToSqlite(db, payload, "merge");

    expect(result.skipped.removal_requests).toBe(1);
    expect(result.added.removal_requests).toBe(0);

    const count = db.prepare("SELECT COUNT(*) as c FROM removal_requests").get() as { c: number };
    expect(count.c).toBe(1); // Still just 1
  });

  it("merge mode adds new records alongside existing", async () => {
    const db = makeDb();
    const rrRepo = new RemovalRequestRepo(db);
    rrRepo.create({ brokerId: "spokeo", method: "email" });

    // Export payload with spokeo, then add beenverified to it
    const payload = exportFromSqlite(db, { profile: testProfile, settings: testSettings });
    payload.removal_requests.push({
      _export_id: "rr:NEW", broker_id: "beenverified", method: "email", status: "pending",
      template_used: "gdpr", email_sent_to: null, confidence_score: null, attempt_count: 0,
      last_error: null, metadata: null,
      created_at: "2026-01-15T10:00:00Z", updated_at: "2026-01-15T10:00:00Z"
    });

    const result = importToSqlite(db, payload, "merge");

    expect(result.added.removal_requests).toBe(1);
    expect(result.skipped.removal_requests).toBe(1);

    const count = db.prepare("SELECT COUNT(*) as c FROM removal_requests").get() as { c: number };
    expect(count.c).toBe(2);
  });
});
