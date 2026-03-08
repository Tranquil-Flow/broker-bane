import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import {
  getDailySolveCount,
  resetDailySolveCount,
  incrementDailySolveCount,
} from "../../src/captcha/solver.js";

describe("CAPTCHA daily limit persistence", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    resetDailySolveCount(db);
  });

  afterEach(() => {
    db.close();
  });

  it("starts at zero for a new day", () => {
    const count = getDailySolveCount(db);
    expect(count).toBe(0);
  });

  it("increments count", () => {
    incrementDailySolveCount(db);
    incrementDailySolveCount(db);
    const count = getDailySolveCount(db);
    expect(count).toBe(2);
  });

  it("resets when date changes", () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    db.prepare("INSERT OR REPLACE INTO daily_counters (key, count, date) VALUES (?, ?, ?)")
      .run("captcha_solves", 50, yesterday);

    const count = getDailySolveCount(db);
    expect(count).toBe(0);
  });

  it("falls back to in-memory when no DB provided", () => {
    resetDailySolveCount();
    const count = getDailySolveCount();
    expect(count).toBe(0);
    incrementDailySolveCount();
    expect(getDailySolveCount()).toBe(1);
    // Clean up in-memory state
    resetDailySolveCount();
  });
});
