import { describe, it, expect, beforeEach } from "vitest";
import type { Database } from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { RescanScheduleRepo } from "../../src/db/repositories/rescan-schedule.repo.js";
import { scheduleRescanAfterCompletion } from "../../src/commands/rescan.cmd.js";

function makeDb(): Database {
  const db = createInMemoryDatabase();
  runMigrations(db);
  return db;
}

describe("RescanScheduleRepo", () => {
  let db: Database;
  let repo: RescanScheduleRepo;

  beforeEach(() => {
    db = makeDb();
    repo = new RescanScheduleRepo(db);
  });

  it("upsert creates a new schedule entry", () => {
    const row = repo.upsert("broker-a", 90);
    expect(row.broker_id).toBe("broker-a");
    expect(row.interval_days).toBe(90);
    expect(row.last_rescan_at).toBeNull();
    expect(typeof row.next_rescan_at).toBe("string");
    expect(new Date(row.next_rescan_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("upsert updates existing schedule", () => {
    repo.upsert("broker-a", 90);
    const updated = repo.upsert("broker-a", 30);
    expect(updated.interval_days).toBe(30);
    // Should only have one row
    expect(repo.getAll()).toHaveLength(1);
  });

  it("getByBrokerId returns undefined for unknown broker", () => {
    expect(repo.getByBrokerId("nonexistent")).toBeUndefined();
  });

  it("getByBrokerId returns the correct row", () => {
    repo.upsert("broker-x", 60);
    const row = repo.getByBrokerId("broker-x");
    expect(row).toBeDefined();
    expect(row!.broker_id).toBe("broker-x");
    expect(row!.interval_days).toBe(60);
  });

  it("getAll returns all scheduled brokers", () => {
    repo.upsert("broker-a", 90);
    repo.upsert("broker-b", 60);
    repo.upsert("broker-c", 30);
    const all = repo.getAll();
    expect(all).toHaveLength(3);
  });

  it("getDue returns brokers whose next_rescan_at is in the past", () => {
    repo.upsert("broker-future", 90);
    repo.upsert("broker-past", 90);

    // Backdate broker-past to be overdue
    db.prepare(
      `UPDATE rescan_schedule SET next_rescan_at = datetime('now', '-1 day') WHERE broker_id = ?`
    ).run("broker-past");

    const due = repo.getDue();
    expect(due).toHaveLength(1);
    expect(due[0]!.broker_id).toBe("broker-past");
  });

  it("getDue returns empty array when no brokers are due", () => {
    repo.upsert("broker-a", 90);
    expect(repo.getDue()).toHaveLength(0);
  });

  it("markRescanned sets last_rescan_at and advances next_rescan_at", () => {
    repo.upsert("broker-a", 30);

    // Backdate it to be overdue
    db.prepare(
      `UPDATE rescan_schedule SET next_rescan_at = datetime('now', '-1 day') WHERE broker_id = ?`
    ).run("broker-a");

    repo.markRescanned("broker-a");
    const row = repo.getByBrokerId("broker-a")!;

    expect(row.last_rescan_at).not.toBeNull();
    // next_rescan_at should now be in the future (advanced by interval_days)
    expect(new Date(row.next_rescan_at).getTime()).toBeGreaterThan(Date.now());
    // No longer due
    expect(repo.getDue()).toHaveLength(0);
  });

  it("remove deletes the schedule for a broker", () => {
    repo.upsert("broker-a", 90);
    expect(repo.getByBrokerId("broker-a")).toBeDefined();
    repo.remove("broker-a");
    expect(repo.getByBrokerId("broker-a")).toBeUndefined();
  });

  it("remove is a no-op for non-existent broker", () => {
    expect(() => repo.remove("nonexistent")).not.toThrow();
  });
});

describe("RemovalRequestRepo.getStale", () => {
  let db: Database;
  let repo: RemovalRequestRepo;

  beforeEach(() => {
    db = makeDb();
    repo = new RemovalRequestRepo(db);
  });

  it("returns empty array when no requests", () => {
    expect(repo.getStale(30)).toEqual([]);
  });

  it("does not return recently-updated requests", () => {
    const req = repo.create({ brokerId: "broker-a", method: "email" });
    repo.updateStatus(req.id, "sent");
    expect(repo.getStale(30)).toHaveLength(0);
  });

  it("returns requests older than daysWithoutConfirmation", () => {
    const req = repo.create({ brokerId: "broker-a", method: "email" });
    repo.updateStatus(req.id, "sent");

    // Backdate to 40 days ago
    db.prepare(
      `UPDATE removal_requests SET updated_at = datetime('now', '-40 days') WHERE id = ?`
    ).run(req.id);

    expect(repo.getStale(30)).toHaveLength(1);
  });

  it("only returns sent and awaiting_confirmation status", () => {
    const statuses = [
      "sent",
      "awaiting_confirmation",
      "confirmed",
      "completed",
      "failed",
      "pending",
    ] as const;

    for (const status of statuses) {
      const req = repo.create({ brokerId: `broker-${status}`, method: "email" });
      if (status !== "pending") {
        repo.updateStatus(req.id, status);
      }
      // Backdate all to 60 days ago
      db.prepare(
        `UPDATE removal_requests SET updated_at = datetime('now', '-60 days') WHERE id = ?`
      ).run(req.id);
    }

    const stale = repo.getStale(30);
    const staleStatuses = stale.map((r) => r.status);
    expect(staleStatuses).toContain("sent");
    expect(staleStatuses).toContain("awaiting_confirmation");
    expect(staleStatuses).not.toContain("confirmed");
    expect(staleStatuses).not.toContain("completed");
    expect(staleStatuses).not.toContain("failed");
    expect(staleStatuses).not.toContain("pending");
  });

  it("respects the days threshold", () => {
    const req = repo.create({ brokerId: "broker-a", method: "email" });
    repo.updateStatus(req.id, "sent");
    db.prepare(
      `UPDATE removal_requests SET updated_at = datetime('now', '-15 days') WHERE id = ?`
    ).run(req.id);

    // 15 days old, threshold = 30 → not stale
    expect(repo.getStale(30)).toHaveLength(0);
    // 15 days old, threshold = 10 → stale
    expect(repo.getStale(10)).toHaveLength(1);
  });
});

describe("scheduleRescanAfterCompletion", () => {
  let db: Database;
  let rescanRepo: RescanScheduleRepo;

  beforeEach(() => {
    db = makeDb();
    rescanRepo = new RescanScheduleRepo(db);
  });

  it("creates a rescan schedule for the broker", () => {
    scheduleRescanAfterCompletion(rescanRepo, "broker-a", 90);
    const row = rescanRepo.getByBrokerId("broker-a");
    expect(row).toBeDefined();
    expect(row!.interval_days).toBe(90);
    expect(new Date(row!.next_rescan_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("uses 90 days as default interval", () => {
    scheduleRescanAfterCompletion(rescanRepo, "broker-a");
    const row = rescanRepo.getByBrokerId("broker-a")!;
    expect(row.interval_days).toBe(90);
  });

  it("updates existing schedule if called again", () => {
    scheduleRescanAfterCompletion(rescanRepo, "broker-a", 90);
    scheduleRescanAfterCompletion(rescanRepo, "broker-a", 30);
    expect(rescanRepo.getAll()).toHaveLength(1);
    expect(rescanRepo.getByBrokerId("broker-a")!.interval_days).toBe(30);
  });
});
