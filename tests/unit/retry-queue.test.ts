/**
 * Tests for retry queue for transient failures.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { RetryQueueRepo } from "../../src/db/repositories/retry-queue.repo.js";
import { RetryQueue, isTransientError, extractErrorInfo } from "../../src/pipeline/retry-queue.js";
import { runMigrations } from "../../src/db/migrations.js";

function createInMemoryDatabase(): InstanceType<typeof Database> {
  return new Database(":memory:");
}

describe("isTransientError", () => {
  it("returns true for ECONNRESET", () => {
    const err = new Error("Connection reset");
    (err as any).code = "ECONNRESET";
    expect(isTransientError(err)).toBe(true);
  });

  it("returns true for ETIMEDOUT", () => {
    const err = new Error("Connection timed out");
    (err as any).code = "ETIMEDOUT";
    expect(isTransientError(err)).toBe(true);
  });

  it("returns true for 503 status code", () => {
    const err = { message: "Service Unavailable", statusCode: 503 };
    expect(isTransientError(err)).toBe(true);
  });

  it("returns true for 429 status code", () => {
    const err = { message: "Too Many Requests", status: 429 };
    expect(isTransientError(err)).toBe(true);
  });

  it("returns true for timeout message", () => {
    const err = new Error("Request timed out after 30000ms");
    expect(isTransientError(err)).toBe(true);
  });

  it("returns true for socket hang up message", () => {
    const err = new Error("socket hang up");
    expect(isTransientError(err)).toBe(true);
  });

  it("returns false for 404 status code", () => {
    const err = { message: "Not Found", statusCode: 404 };
    expect(isTransientError(err)).toBe(false);
  });

  it("returns false for authentication error", () => {
    const err = new Error("Invalid credentials");
    (err as any).code = "EAUTH";
    expect(isTransientError(err)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isTransientError(null)).toBe(false);
  });

  it("returns false for string", () => {
    expect(isTransientError("some error")).toBe(false);
  });
});

describe("extractErrorInfo", () => {
  it("extracts message and code from Error", () => {
    const err = new Error("Test error");
    (err as any).code = "ECODE";
    const info = extractErrorInfo(err);
    expect(info.message).toBe("Test error");
    expect(info.code).toBe("ECODE");
  });

  it("handles Error without code", () => {
    const err = new Error("Test error");
    const info = extractErrorInfo(err);
    expect(info.message).toBe("Test error");
    expect(info.code).toBeUndefined();
  });

  it("stringifies non-Error values", () => {
    const info = extractErrorInfo({ foo: "bar" });
    expect(info.message).toBe("[object Object]");
  });
});

describe("RetryQueueRepo", () => {
  let db: InstanceType<typeof Database>;
  let repo: RetryQueueRepo;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new RetryQueueRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("enqueues and retrieves an item", () => {
    const id = repo.enqueue({
      brokerId: "spokeo",
      taskType: "email",
      payload: { to: "test@spokeo.com" },
      errorMessage: "Connection reset",
      errorCode: "ECONNRESET",
      nextRetryAt: new Date(Date.now() + 60000),
    });

    const item = repo.get(id);
    expect(item).toBeDefined();
    expect(item?.broker_id).toBe("spokeo");
    expect(item?.task_type).toBe("email");
    expect(item?.error_code).toBe("ECONNRESET");
    expect(JSON.parse(item!.payload)).toEqual({ to: "test@spokeo.com" });
  });

  it("getReady returns items past their retry time", () => {
    // Item ready now
    repo.enqueue({
      brokerId: "ready",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      nextRetryAt: new Date(Date.now() - 1000), // In the past
    });

    // Item not ready
    repo.enqueue({
      brokerId: "notready",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      nextRetryAt: new Date(Date.now() + 60000), // In the future
    });

    const ready = repo.getReady();
    expect(ready.length).toBe(1);
    expect(ready[0]?.broker_id).toBe("ready");
  });

  it("updates attempt count and next retry time", () => {
    const id = repo.enqueue({
      brokerId: "test",
      taskType: "email",
      payload: {},
      errorMessage: "Error 1",
      nextRetryAt: new Date(),
    });

    const newRetryTime = new Date(Date.now() + 120000);
    repo.update(id, {
      attemptCount: 2,
      nextRetryAt: newRetryTime,
      errorMessage: "Error 2",
    });

    const item = repo.get(id);
    expect(item?.attempt_count).toBe(2);
    expect(item?.error_message).toBe("Error 2");
  });

  it("removes item by id", () => {
    const id = repo.enqueue({
      brokerId: "test",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      nextRetryAt: new Date(),
    });

    repo.remove(id);
    expect(repo.get(id)).toBeUndefined();
  });

  it("removes all items for a broker", () => {
    repo.enqueue({
      brokerId: "broker1",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      nextRetryAt: new Date(),
    });
    repo.enqueue({
      brokerId: "broker1",
      taskType: "web_form",
      payload: {},
      errorMessage: "Error",
      nextRetryAt: new Date(),
    });
    repo.enqueue({
      brokerId: "broker2",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      nextRetryAt: new Date(),
    });

    const removed = repo.removeByBroker("broker1");
    expect(removed).toBe(2);
    expect(repo.countPending()).toBe(1);
  });

  it("cleanup removes items over max attempts", () => {
    repo.enqueue({
      brokerId: "test",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      attemptCount: 5,
      nextRetryAt: new Date(),
    });
    repo.enqueue({
      brokerId: "test2",
      taskType: "email",
      payload: {},
      errorMessage: "Error",
      attemptCount: 2,
      nextRetryAt: new Date(),
    });

    const removed = repo.cleanup(5);
    expect(removed).toBe(1);
    expect(repo.countPending()).toBe(1);
  });
});

describe("RetryQueue", () => {
  let db: InstanceType<typeof Database>;
  let repo: RetryQueueRepo;
  let queue: RetryQueue;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new RetryQueueRepo(db);
    queue = new RetryQueue(repo, {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: 0,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("enqueueIfTransient", () => {
    it("queues transient errors", () => {
      const err = new Error("Connection reset");
      (err as any).code = "ECONNRESET";

      const queued = queue.enqueueIfTransient(
        "spokeo",
        "email",
        { to: "test@spokeo.com" },
        err
      );

      expect(queued).toBe(true);
      expect(repo.countPending()).toBe(1);
    });

    it("does not queue non-transient errors", () => {
      const err = new Error("Invalid email format");
      (err as any).code = "VALIDATION_ERROR";

      const queued = queue.enqueueIfTransient(
        "spokeo",
        "email",
        { to: "invalid" },
        err
      );

      expect(queued).toBe(false);
      expect(repo.countPending()).toBe(0);
    });
  });

  describe("recordResult", () => {
    it("removes item on success", () => {
      const id = repo.enqueue({
        brokerId: "test",
        taskType: "email",
        payload: {},
        errorMessage: "Error",
        nextRetryAt: new Date(),
      });

      const result = queue.recordResult(id, true);
      expect(result.removed).toBe(true);
      expect(result.requeued).toBe(false);
      expect(repo.get(id)).toBeUndefined();
    });

    it("requeues on transient failure", () => {
      const id = repo.enqueue({
        brokerId: "test",
        taskType: "email",
        payload: {},
        errorMessage: "Error",
        attemptCount: 1,
        nextRetryAt: new Date(),
      });

      const err = new Error("Connection reset");
      (err as any).code = "ECONNRESET";

      const result = queue.recordResult(id, false, err);
      expect(result.removed).toBe(false);
      expect(result.requeued).toBe(true);

      const item = repo.get(id);
      expect(item?.attempt_count).toBe(2);
    });

    it("removes after max attempts", () => {
      const id = repo.enqueue({
        brokerId: "test",
        taskType: "email",
        payload: {},
        errorMessage: "Error",
        attemptCount: 2, // Already at 2, max is 3
        nextRetryAt: new Date(),
      });

      const err = new Error("Connection reset");
      (err as any).code = "ECONNRESET";

      const result = queue.recordResult(id, false, err);
      expect(result.removed).toBe(true);
      expect(result.requeued).toBe(false);
    });

    it("removes when error becomes non-transient", () => {
      const id = repo.enqueue({
        brokerId: "test",
        taskType: "email",
        payload: {},
        errorMessage: "Error",
        attemptCount: 1,
        nextRetryAt: new Date(),
      });

      // Non-transient error
      const err = new Error("Invalid recipient");

      const result = queue.recordResult(id, false, err);
      expect(result.removed).toBe(true);
      expect(result.requeued).toBe(false);
    });
  });

  describe("forceEnqueue", () => {
    it("enqueues regardless of error type", () => {
      const id = queue.forceEnqueue({
        brokerId: "test",
        taskType: "email",
        payload: { to: "test@example.com" },
        errorMessage: "Manual requeue",
        delayMs: 5000,
      });

      expect(id).toBeGreaterThan(0);
      expect(repo.countPending()).toBe(1);
    });
  });

  describe("getStats", () => {
    it("returns correct counts", () => {
      // Ready item
      repo.enqueue({
        brokerId: "ready",
        taskType: "email",
        payload: {},
        errorMessage: "Error",
        nextRetryAt: new Date(Date.now() - 1000),
      });

      // Not ready item
      repo.enqueue({
        brokerId: "pending",
        taskType: "email",
        payload: {},
        errorMessage: "Error",
        nextRetryAt: new Date(Date.now() + 60000),
      });

      const stats = queue.getStats();
      expect(stats.pending).toBe(2);
      expect(stats.ready).toBe(1);
    });
  });

  describe("parsePayload", () => {
    it("parses JSON payload from row", () => {
      const id = repo.enqueue({
        brokerId: "test",
        taskType: "email",
        payload: { to: "test@example.com", subject: "Test" },
        errorMessage: "Error",
        nextRetryAt: new Date(),
      });

      const row = repo.get(id)!;
      const payload = queue.parsePayload<{ to: string; subject: string }>(row);
      expect(payload.to).toBe("test@example.com");
      expect(payload.subject).toBe("Test");
    });
  });
});
