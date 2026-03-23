import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import {
  buildReportSummary,
  buildBrokerHistory,
} from "../../src/commands/report.cmd.js";

function makeDb(): Database {
  const db = createInMemoryDatabase();
  runMigrations(db);
  return db;
}

describe("buildReportSummary", () => {
  let db: Database;
  let repo: RemovalRequestRepo;

  beforeEach(() => {
    db = makeDb();
    repo = new RemovalRequestRepo(db);
  });

  it("returns zeros when no requests exist", () => {
    const summary = buildReportSummary(repo);
    expect(summary.contacted).toBe(0);
    expect(summary.confirmed_removed).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.stale).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.counts).toEqual({});
  });

  it("counts contacted (sent + awaiting_confirmation + confirmed + completed + failed)", () => {
    repo.create({ brokerId: "broker-a", method: "email" });
    repo.create({ brokerId: "broker-b", method: "email" });
    repo.create({ brokerId: "broker-c", method: "email" });

    const all = repo.getAll();
    repo.updateStatus(all[0]!.id, "sent");
    repo.updateStatus(all[1]!.id, "completed");
    repo.updateStatus(all[2]!.id, "failed");

    const summary = buildReportSummary(repo);
    expect(summary.contacted).toBe(3);
    expect(summary.failed).toBe(1);
  });

  it("counts confirmed_removed (confirmed + completed)", () => {
    repo.create({ brokerId: "broker-a", method: "email" });
    repo.create({ brokerId: "broker-b", method: "email" });
    repo.create({ brokerId: "broker-c", method: "email" });

    const all = repo.getAll();
    repo.updateStatus(all[0]!.id, "confirmed");
    repo.updateStatus(all[1]!.id, "completed");
    repo.updateStatus(all[2]!.id, "sent");

    const summary = buildReportSummary(repo);
    expect(summary.confirmed_removed).toBe(2);
  });

  it("counts pending (pending + scanning + matched + sending)", () => {
    const statuses = ["pending", "scanning", "matched", "sending"] as const;
    for (const status of statuses) {
      const req = repo.create({ brokerId: `broker-${status}`, method: "email" });
      if (status !== "pending") {
        repo.updateStatus(req.id, status);
      }
    }

    const summary = buildReportSummary(repo);
    expect(summary.pending).toBe(4);
  });

  it("does not count stale requests when they are recent", () => {
    repo.create({ brokerId: "broker-a", method: "email" });
    const all = repo.getAll();
    repo.updateStatus(all[0]!.id, "sent");

    // Not stale — just updated
    const summary = buildReportSummary(repo, 30);
    expect(summary.stale).toBe(0);
  });

  it("includes generated_at timestamp", () => {
    const before = Date.now();
    const summary = buildReportSummary(repo);
    const after = Date.now();
    const ts = new Date(summary.generated_at).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("counts stale requests using injected getStale", () => {
    // Insert a request and manually backdate it to simulate staleness
    const req = repo.create({ brokerId: "broker-stale", method: "email" });
    repo.updateStatus(req.id, "sent");

    // Backdate updated_at by 60 days via raw SQL
    db.prepare(
      `UPDATE removal_requests SET updated_at = datetime('now', '-60 days') WHERE id = ?`
    ).run(req.id);

    const summary = buildReportSummary(repo, 30);
    expect(summary.stale).toBe(1);
  });
});

describe("buildBrokerHistory", () => {
  let db: Database;
  let repo: RemovalRequestRepo;

  beforeEach(() => {
    db = makeDb();
    repo = new RemovalRequestRepo(db);
  });

  it("returns empty array when no requests", () => {
    const history = buildBrokerHistory(repo);
    expect(history).toEqual([]);
  });

  it("groups attempts by broker_id", () => {
    repo.create({ brokerId: "broker-a", method: "email" });
    repo.create({ brokerId: "broker-b", method: "email" });
    repo.create({ brokerId: "broker-a", method: "email" });

    const history = buildBrokerHistory(repo);
    expect(history).toHaveLength(2);

    const brokerA = history.find((h) => h.broker_id === "broker-a");
    expect(brokerA).toBeDefined();
    expect(brokerA!.attempts).toHaveLength(2);

    const brokerB = history.find((h) => h.broker_id === "broker-b");
    expect(brokerB).toBeDefined();
    expect(brokerB!.attempts).toHaveLength(1);
  });

  it("each attempt includes status and timestamps", () => {
    const req = repo.create({ brokerId: "broker-a", method: "email" });
    repo.updateStatus(req.id, "sent");

    const history = buildBrokerHistory(repo);
    const attempt = history[0]!.attempts[0]!;
    expect(attempt.status).toBe("sent");
    expect(typeof attempt.updated_at).toBe("string");
    expect(typeof attempt.created_at).toBe("string");
    expect(typeof attempt.attempt_count).toBe("number");
  });

  it("sorts brokers alphabetically", () => {
    repo.create({ brokerId: "zebra-broker", method: "email" });
    repo.create({ brokerId: "alpha-broker", method: "email" });
    repo.create({ brokerId: "middle-broker", method: "email" });

    const history = buildBrokerHistory(repo);
    expect(history[0]!.broker_id).toBe("alpha-broker");
    expect(history[1]!.broker_id).toBe("middle-broker");
    expect(history[2]!.broker_id).toBe("zebra-broker");
  });
});
