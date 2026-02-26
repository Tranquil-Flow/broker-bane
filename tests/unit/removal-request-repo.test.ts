import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { REQUEST_STATUS } from "../../src/types/pipeline.js";

function makeDb() {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("RemovalRequestRepo.getLastSentAt", () => {
  let repo: RemovalRequestRepo;

  beforeEach(() => {
    repo = new RemovalRequestRepo(makeDb());
  });

  it("returns null when no sent requests exist for broker", () => {
    expect(repo.getLastSentAt("acxiom")).toBeNull();
  });

  it("returns an ISO datetime string after a sent request", () => {
    const req = repo.create({ brokerId: "acxiom", method: "email" });
    repo.updateStatus(req.id, REQUEST_STATUS.sent);
    const result = repo.getLastSentAt("acxiom");
    expect(result).not.toBeNull();
    expect(typeof result).toBe("string");
    expect(Number.isFinite(new Date(result!).getTime())).toBe(true);
  });

  it("returns null for only-failed requests", () => {
    const req = repo.create({ brokerId: "spokeo", method: "web_form" });
    repo.updateStatus(req.id, REQUEST_STATUS.failed);
    expect(repo.getLastSentAt("spokeo")).toBeNull();
  });

  it("returns null for pending requests", () => {
    repo.create({ brokerId: "whitepages", method: "web_form" });
    expect(repo.getLastSentAt("whitepages")).toBeNull();
  });

  it("does not return results from a different broker", () => {
    const req = repo.create({ brokerId: "acxiom", method: "email" });
    repo.updateStatus(req.id, REQUEST_STATUS.sent);
    expect(repo.getLastSentAt("spokeo")).toBeNull();
  });
});
