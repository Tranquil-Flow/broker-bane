import { describe, expect, it, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { Orchestrator } from "../../src/pipeline/orchestrator.js";
import { createTestConfig } from "../helpers/config.js";

describe("Orchestrator database lifecycle", () => {
  let injectedDb: InstanceType<typeof Database>;

  beforeEach(() => {
    injectedDb = new Database(":memory:");
    runMigrations(injectedDb);
  });

  afterEach(() => {
    if (injectedDb.open) injectedDb.close();
  });

  it("uses the injected db for preview() and leaves it open after cleanup()", async () => {
    const orchestrator = new Orchestrator(createTestConfig(), { db: injectedDb });

    await orchestrator.preview();
    await orchestrator.cleanup();

    expect(injectedDb.open).toBe(true);
    expect(() => injectedDb.prepare("SELECT 1").get()).not.toThrow();
  });

  it("reuses the same db across multiple preview() calls (no per-cycle leak)", async () => {
    const orchestrator = new Orchestrator(createTestConfig(), { db: injectedDb });

    for (let i = 0; i < 5; i++) {
      await orchestrator.preview();
    }
    await orchestrator.cleanup();

    expect(injectedDb.open).toBe(true);
  });

  it("falls back to constructing its own db when none is injected", async () => {
    const orchestrator = new Orchestrator(createTestConfig({ database: { path: ":memory:" } }));

    await orchestrator.preview();
    await orchestrator.cleanup();

    expect(injectedDb.open).toBe(true);
  });
});
