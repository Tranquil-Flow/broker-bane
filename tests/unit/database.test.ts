import Database from "better-sqlite3";
import { createInMemoryDatabase, createDatabase, closeDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { BrokerResponseRepo } from "../../src/db/repositories/broker-response.repo.js";
import { PendingTaskRepo } from "../../src/db/repositories/pending-task.repo.js";
import { EmailLogRepo } from "../../src/db/repositories/email-log.repo.js";
import { CircuitBreakerRepo } from "../../src/db/repositories/circuit-breaker.repo.js";
import { PipelineRunRepo } from "../../src/db/repositories/pipeline-run.repo.js";

describe("Database", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("migrations", () => {
    it("creates all tables", () => {
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      expect(names).toContain("removal_requests");
      expect(names).toContain("broker_responses");
      expect(names).toContain("pending_tasks");
      expect(names).toContain("email_log");
      expect(names).toContain("circuit_breaker_state");
      expect(names).toContain("pipeline_runs");
      expect(names).toContain("scan_runs");
      expect(names).toContain("scan_results");
      expect(names).toContain("evidence_chain");
    });

    it("is idempotent", () => {
      expect(() => runMigrations(db)).not.toThrow();
    });

    it("migration v4 creates daily_counters table", () => {
      const db2 = createDatabase(":memory:");
      runMigrations(db2);

      const tables = db2
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_counters'")
        .all();
      expect(tables).toHaveLength(1);

      closeDatabase(db2);
    });
  });

  describe("RemovalRequestRepo", () => {
    let repo: RemovalRequestRepo;

    beforeEach(() => {
      repo = new RemovalRequestRepo(db);
    });

    it("creates and retrieves a request", () => {
      const req = repo.create({
        brokerId: "spokeo",
        method: "web_form",
        templateUsed: "gdpr",
      });
      expect(req.id).toBeDefined();
      expect(req.broker_id).toBe("spokeo");
      expect(req.status).toBe("pending");
      expect(req.attempt_count).toBe(0);
    });

    it("updates status", () => {
      const req = repo.create({ brokerId: "test", method: "email" });
      repo.updateStatus(req.id, "sending");
      const updated = repo.getById(req.id);
      expect(updated?.status).toBe("sending");
    });

    it("updates status with error", () => {
      const req = repo.create({ brokerId: "test", method: "email" });
      repo.updateStatus(req.id, "failed", "Connection timeout");
      const updated = repo.getById(req.id);
      expect(updated?.status).toBe("failed");
      expect(updated?.last_error).toBe("Connection timeout");
    });

    it("increments attempt count", () => {
      const req = repo.create({ brokerId: "test", method: "email" });
      repo.incrementAttempt(req.id);
      repo.incrementAttempt(req.id);
      const updated = repo.getById(req.id);
      expect(updated?.attempt_count).toBe(2);
    });

    it("counts by status", () => {
      repo.create({ brokerId: "a", method: "email" });
      repo.create({ brokerId: "b", method: "email" });
      const req3 = repo.create({ brokerId: "c", method: "email" });
      repo.updateStatus(req3.id, "sending");

      const counts = repo.countByStatus();
      expect(counts["pending"]).toBe(2);
      expect(counts["sending"]).toBe(1);
    });

    it("gets latest for broker", () => {
      repo.create({ brokerId: "spokeo", method: "email" });
      const latest = repo.create({ brokerId: "spokeo", method: "web_form" });
      const result = repo.getLatestForBroker("spokeo");
      expect(result?.id).toBe(latest.id);
    });
  });

  describe("BrokerResponseRepo", () => {
    let requestRepo: RemovalRequestRepo;
    let repo: BrokerResponseRepo;

    beforeEach(() => {
      requestRepo = new RemovalRequestRepo(db);
      repo = new BrokerResponseRepo(db);
    });

    it("creates and retrieves a response", () => {
      const req = requestRepo.create({ brokerId: "test", method: "email" });
      const resp = repo.create({
        requestId: req.id,
        responseType: "confirmation",
        rawBodyHash: "abc123hash",
        rawSubject: "Confirm your request",
      });
      expect(resp.response_type).toBe("confirmation");
      expect(resp.is_processed).toBe(0);
    });

    it("checks hash existence", () => {
      const req = requestRepo.create({ brokerId: "test", method: "email" });
      repo.create({
        requestId: req.id,
        responseType: "confirmation",
        rawBodyHash: "unique-hash",
      });
      expect(repo.existsByHash("unique-hash")).toBe(true);
      expect(repo.existsByHash("nonexistent")).toBe(false);
    });

    it("marks as processed", () => {
      const req = requestRepo.create({ brokerId: "test", method: "email" });
      const resp = repo.create({
        requestId: req.id,
        responseType: "confirmation",
        rawBodyHash: "hash1",
      });
      repo.markProcessed(resp.id);
      const updated = repo.getById(resp.id);
      expect(updated?.is_processed).toBe(1);
    });
  });

  describe("PendingTaskRepo", () => {
    let requestRepo: RemovalRequestRepo;
    let repo: PendingTaskRepo;

    beforeEach(() => {
      requestRepo = new RemovalRequestRepo(db);
      repo = new PendingTaskRepo(db);
    });

    it("creates and retrieves pending tasks", () => {
      const req = requestRepo.create({ brokerId: "test", method: "web_form" });
      const task = repo.create({
        requestId: req.id,
        taskType: "captcha_solve",
        description: "Solve CAPTCHA on radaris.com",
      });
      expect(task.task_type).toBe("captcha_solve");
      expect(task.is_completed).toBe(0);
    });

    it("marks task completed", () => {
      const req = requestRepo.create({ brokerId: "test", method: "web_form" });
      const task = repo.create({
        requestId: req.id,
        taskType: "manual_form",
        description: "Fill form manually",
      });
      repo.markCompleted(task.id);
      const pending = repo.getPending();
      expect(pending).toHaveLength(0);
    });

    it("counts pending tasks", () => {
      const req = requestRepo.create({ brokerId: "test", method: "web_form" });
      repo.create({ requestId: req.id, taskType: "captcha_solve", description: "a" });
      repo.create({ requestId: req.id, taskType: "manual_form", description: "b" });
      expect(repo.countPending()).toBe(2);
    });
  });

  describe("CircuitBreakerRepo", () => {
    let repo: CircuitBreakerRepo;

    beforeEach(() => {
      repo = new CircuitBreakerRepo(db);
    });

    it("upserts circuit breaker state", () => {
      repo.upsert({ brokerId: "spokeo", state: "closed", failureCount: 0 });
      const state = repo.get("spokeo");
      expect(state?.state).toBe("closed");
      expect(state?.failure_count).toBe(0);
    });

    it("updates on conflict", () => {
      repo.upsert({ brokerId: "spokeo", state: "closed", failureCount: 0 });
      repo.upsert({ brokerId: "spokeo", state: "open", failureCount: 3 });
      const state = repo.get("spokeo");
      expect(state?.state).toBe("open");
      expect(state?.failure_count).toBe(3);
    });

    it("resets circuit breaker", () => {
      repo.upsert({ brokerId: "spokeo", state: "open", failureCount: 3 });
      repo.reset("spokeo");
      const state = repo.get("spokeo");
      expect(state?.state).toBe("closed");
      expect(state?.failure_count).toBe(0);
    });

    it("gets open breakers", () => {
      repo.upsert({ brokerId: "a", state: "open", failureCount: 3 });
      repo.upsert({ brokerId: "b", state: "closed", failureCount: 0 });
      repo.upsert({ brokerId: "c", state: "open", failureCount: 5 });
      const open = repo.getOpen();
      expect(open).toHaveLength(2);
    });
  });

  describe("PipelineRunRepo", () => {
    let repo: PipelineRunRepo;

    beforeEach(() => {
      repo = new PipelineRunRepo(db);
    });

    it("creates a pipeline run", () => {
      const run = repo.create(100);
      expect(run.total_brokers).toBe(100);
      expect(run.status).toBe("running");
      expect(run.sent_count).toBe(0);
    });

    it("finishes a run with counts", () => {
      const run = repo.create(50);
      repo.finish(run.id, "completed", { sent: 40, failed: 5, skipped: 5 });
      const updated = repo.getById(run.id);
      expect(updated?.status).toBe("completed");
      expect(updated?.sent_count).toBe(40);
      expect(updated?.failed_count).toBe(5);
      expect(updated?.finished_at).toBeTruthy();
    });

    it("increments counts individually", () => {
      const run = repo.create(10);
      repo.incrementSent(run.id);
      repo.incrementSent(run.id);
      repo.incrementFailed(run.id);
      const updated = repo.getById(run.id);
      expect(updated?.sent_count).toBe(2);
      expect(updated?.failed_count).toBe(1);
    });

    it("gets latest run", () => {
      repo.create(10);
      const second = repo.create(20);
      const latest = repo.getLatest();
      expect(latest?.id).toBe(second.id);
    });
  });
});
