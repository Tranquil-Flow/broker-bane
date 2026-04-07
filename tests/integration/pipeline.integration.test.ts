/**
 * Integration tests for the full removal pipeline.
 * These tests use an in-memory SQLite database and dry-run mode to avoid
 * any external network calls.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("keytar", () => ({
  default: {
    setPassword: vi.fn(async () => undefined),
    getPassword: vi.fn(async () => null),
    deletePassword: vi.fn(async () => true),
  },
}));
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { Orchestrator } from "../../src/pipeline/orchestrator.js";
import { loadConfig } from "../../src/config/loader.js";
import { createDatabase, createInMemoryDatabase, closeDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { PendingTaskRepo } from "../../src/db/repositories/pending-task.repo.js";

function makeTestConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane.doe@example.com",
      country: "US",
    },
    email: {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "jane@example.com", pass: "testpassword" },
    },
    options: {
      template: "gdpr",
      dry_run: true,
      regions: ["us"],
      tiers: [1, 2, 3],
      excluded_brokers: [],
      delay_min_ms: 0,
      delay_max_ms: 0,
    },
    ...overrides,
  };
}

function writeTestConfig(dir: string, config: Record<string, unknown>): string {
  const configPath = join(dir, "config.yaml");
  writeFileSync(configPath, yaml.dump(config), { mode: 0o600 });
  return configPath;
}

describe("Pipeline Integration", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `brokerbane-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    configPath = writeTestConfig(tmpDir, makeTestConfig({
      database: { path: join(tmpDir, "test.db") },
    }));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("runs email-only broker subset in dry-run mode without errors", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    const summary = await orchestrator.run({
      dryRun: true,
      brokerIds: ["zoominfo", "clearbit", "fullcontact"],
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.totalBrokers).toBe(3);
    expect(summary.failed).toBe(0);
    expect(summary.sent).toBe(3);
    expect(summary.skipped).toBe(0);

    await orchestrator.cleanup();
  });

  it("queues web_form brokers as manual tasks when no browser configured", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    const summary = await orchestrator.run({
      dryRun: true,
      brokerIds: ["spokeo", "beenverified"],
    });

    expect(summary.totalBrokers).toBe(2);
    expect(summary.manualRequired).toBe(2);
    expect(summary.failed).toBe(0);

    // Verify pending tasks were created in the DB
    const db = createDatabase(config.database.path);
    runMigrations(db);
    const taskRepo = new PendingTaskRepo(db);
    const tasks = taskRepo.getPending();
    expect(tasks.length).toBe(2);
    expect(tasks.every((t) => t.task_type === "manual_form")).toBe(true);
    closeDatabase(db);

    await orchestrator.cleanup();
  });

  it("skips excluded brokers", async () => {
    const config = loadConfig(writeTestConfig(tmpDir, makeTestConfig({
      database: { path: join(tmpDir, "test.db") },
      options: {
        template: "gdpr",
        dry_run: true,
        regions: ["us"],
        tiers: [1],
        excluded_brokers: ["zoominfo", "clearbit"],
        delay_min_ms: 0,
        delay_max_ms: 0,
      },
    })));
    const orchestrator = new Orchestrator(config);

    const summary = await orchestrator.run({ dryRun: true });

    // zoominfo and clearbit should be excluded
    const db = createDatabase(config.database.path);
    runMigrations(db);
    const requestRepo = new RemovalRequestRepo(db);
    const all = requestRepo.getAll();
    const ids = all.map((r) => r.broker_id);
    expect(ids).not.toContain("zoominfo");
    expect(ids).not.toContain("clearbit");
    closeDatabase(db);

    await orchestrator.cleanup();
  });

  it("filters by region", async () => {
    const config = loadConfig(writeTestConfig(tmpDir, makeTestConfig({
      database: { path: join(tmpDir, "test.db") },
      options: {
        template: "gdpr",
        dry_run: true,
        regions: ["eu"],
        tiers: [1, 2, 3],
        excluded_brokers: [],
        delay_min_ms: 0,
        delay_max_ms: 0,
      },
    })));
    const orchestrator = new Orchestrator(config);

    const summary = await orchestrator.run({ dryRun: true });

    const db = createDatabase(config.database.path);
    runMigrations(db);
    const requestRepo = new RemovalRequestRepo(db);
    const all = requestRepo.getAll();
    expect(all.length).toBeGreaterThan(0);
    // Only EU brokers (acxiom_eu, experian_uk, equifax_uk, epsilon_eu)
    expect(all.length).toBeGreaterThanOrEqual(3);
    closeDatabase(db);

    await orchestrator.cleanup();
  });

  it("handles resume by skipping completed brokers", async () => {
    const config = loadConfig(configPath);

    // First run - process email brokers
    const orch1 = new Orchestrator(config);
    await orch1.run({ dryRun: true, brokerIds: ["zoominfo", "clearbit"] });
    await orch1.cleanup();

    // Mark one as completed
    const db = createDatabase(config.database.path);
    runMigrations(db);
    const requestRepo = new RemovalRequestRepo(db);
    const requests = requestRepo.getAll();
    requestRepo.updateStatus(requests[0].id, "completed");
    closeDatabase(db);

    // Second run with resume
    const orch2 = new Orchestrator(config);
    const summary = await orch2.run({
      dryRun: true,
      brokerIds: ["zoominfo", "clearbit"],
      resume: true,
    });

    // One was completed, so only one new request
    expect(summary.totalBrokers).toBe(1);
    await orch2.cleanup();
  });

  it("records request status in database for email brokers", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    await orchestrator.run({
      dryRun: true,
      brokerIds: ["zoominfo"],
    });

    const db = createDatabase(config.database.path);
    runMigrations(db);
    const requestRepo = new RemovalRequestRepo(db);
    const requests = requestRepo.getAll();

    expect(requests.length).toBe(1);
    expect(requests[0].broker_id).toBe("zoominfo");
    expect(requests[0].method).toBe("email");
    expect(requests[0].status).toBe("sent");

    closeDatabase(db);
    await orchestrator.cleanup();
  });

  it("abort() stops the pipeline mid-run", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    // Abort immediately before run even starts processing
    orchestrator.abort();
    const summary = await orchestrator.run({ dryRun: true });

    // Aborted immediately: 0 brokers processed
    expect(summary.sent).toBe(0);
    await orchestrator.cleanup();
  });

  it("web_form brokers without browser are counted as manualRequired not sent", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    // spokeo is web_form only
    const summary = await orchestrator.run({
      dryRun: true,
      brokerIds: ["spokeo"],
    });

    expect(summary.totalBrokers).toBe(1);
    expect(summary.sent).toBe(0);
    expect(summary.manualRequired).toBe(1);
    expect(summary.failed).toBe(0);

    await orchestrator.cleanup();
  });

  it("records manual_required status for web_form brokers without browser", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    await orchestrator.run({ dryRun: true, brokerIds: ["spokeo"] });

    const db = createDatabase(config.database.path);
    runMigrations(db);
    const requestRepo = new RemovalRequestRepo(db);
    const requests = requestRepo.getAll();

    expect(requests.length).toBe(1);
    expect(requests[0].broker_id).toBe("spokeo");
    expect(requests[0].status).toBe("manual_required");
    closeDatabase(db);

    await orchestrator.cleanup();
  });

  it("hybrid brokers are marked sent when email is sent (no browser)", async () => {
    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config);

    // Find a hybrid broker — run the full pipeline in dry-run and look for one
    const summary = await orchestrator.run({ dryRun: true });

    const db = createDatabase(config.database.path);
    runMigrations(db);
    const requestRepo = new RemovalRequestRepo(db);
    const hybridRequests = requestRepo.getAll().filter((r) => r.method === "hybrid");

    // Hybrid brokers should be "sent" (email sent) and also have a manual task for the web form
    for (const req of hybridRequests) {
      expect(req.status).toBe("sent");
    }
    closeDatabase(db);

    await orchestrator.cleanup();
  });

  it("loads playbooks from custom directory for web_form broker", async () => {
    const playbookDir = join(tmpDir, "playbooks");
    mkdirSync(playbookDir, { recursive: true });
    const pb = {
      broker_id: "spokeo",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{ name: "submit", steps: [{ action: "goto", url: "https://www.spokeo.com/optout" }] }],
    };
    writeFileSync(join(playbookDir, "spokeo.yaml"), yaml.dump(pb));

    const config = loadConfig(configPath);
    const orchestrator = new Orchestrator(config, { playbookDir });

    // In dry-run without browser, playbook won't execute but orchestrator should construct fine
    const summary = await orchestrator.run({ dryRun: true, brokerIds: ["spokeo"] });
    expect(summary.totalBrokers).toBe(1);
    // Without browser, falls through to manual task even with playbook
    expect(summary.manualRequired).toBe(1);

    await orchestrator.cleanup();
  });

  it("skips brokers whose opt-out was sent within the validity window", async () => {
    // Both runs use dryRun: true (no real SMTP). Validity skipping is triggered
    // by !options.resume (not by dryRun), so the second run skips acxiom because
    // it was already contacted in the first run within the 180-day validity window.
    const cfg = loadConfig(writeTestConfig(tmpDir, makeTestConfig({
      database: { path: join(tmpDir, "validity-test.db") },
      options: {
        template: "gdpr",
        dry_run: true,
        regions: ["us"],
        tiers: [1, 2, 3],
        excluded_brokers: [],
        delay_min_ms: 0,
        delay_max_ms: 0,
      },
    })));

    // First run: sends to acxiom (email broker, won't need SMTP since we mock it)
    const orch1 = new Orchestrator(cfg);
    const summary1 = await orch1.run({ dryRun: true, brokerIds: ["acxiom"] });
    // dry_run: true sends without real SMTP but still marks as sent in DB
    expect(summary1.sent).toBe(1);
    await orch1.cleanup();

    // Second run immediately: acxiom opt-out still valid (sent < 180 days ago)
    // IMPORTANT: validity skip must apply even in dry-run mode to be testable
    const orch2 = new Orchestrator(cfg);
    const summary2 = await orch2.run({ dryRun: true, brokerIds: ["acxiom"] });
    expect(summary2.skipped).toBe(1);
    expect(summary2.sent).toBe(0);
    await orch2.cleanup();
  });
});
