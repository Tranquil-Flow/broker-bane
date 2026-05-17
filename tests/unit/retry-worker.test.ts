import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { RetryQueueRepo } from "../../src/db/repositories/retry-queue.repo.js";
import { EmailLogRepo } from "../../src/db/repositories/email-log.repo.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { RetryQueue } from "../../src/pipeline/retry-queue.js";
import { RetryWorker } from "../../src/pipeline/retry-worker.js";

function createInMemoryDatabase(): InstanceType<typeof Database> {
  return new Database(":memory:");
}

describe("RetryWorker", () => {
  let db: InstanceType<typeof Database>;
  let retryRepo: RetryQueueRepo;
  let queue: RetryQueue;
  let emailLogRepo: EmailLogRepo;
  let requestRepo: RemovalRequestRepo;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    retryRepo = new RetryQueueRepo(db);
    queue = new RetryQueue(retryRepo, {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: 0,
    });
    emailLogRepo = new EmailLogRepo(db);
    requestRepo = new RemovalRequestRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("processes ready retry tasks up to a conservative limit and removes successes", async () => {
    retryRepo.enqueue({ brokerId: "ready-1", taskType: "email", payload: { requestId: 1 }, errorMessage: "timeout", nextRetryAt: new Date(Date.now() - 1000) });
    retryRepo.enqueue({ brokerId: "ready-2", taskType: "email", payload: { requestId: 2 }, errorMessage: "timeout", nextRetryAt: new Date(Date.now() - 1000) });
    retryRepo.enqueue({ brokerId: "ready-3", taskType: "email", payload: { requestId: 3 }, errorMessage: "timeout", nextRetryAt: new Date(Date.now() - 1000) });
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = new RetryWorker({ queue, emailLogRepo, identityId: "removals", dailyLimit: 10, handlers: { email: handler } });

    const result = await worker.processReady({ limit: 2 });

    expect(result.processed).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(retryRepo.countPending()).toBe(1);
  });

  it("leaves email retries queued when the broker-facing identity daily cap is reached", async () => {
    const req = requestRepo.create({ brokerId: "already-sent", method: "email" });
    emailLogRepo.create({ requestId: req.id, direction: "outbound", identityId: "removals", fromAddr: "removals@example.com", toAddr: "privacy@example.com", subject: "Opt out", status: "sent" });
    const retryId = retryRepo.enqueue({ brokerId: "ready", taskType: "email", payload: { requestId: 99 }, errorMessage: "timeout", nextRetryAt: new Date(Date.now() - 1000) });
    const handler = vi.fn().mockResolvedValue(undefined);
    const worker = new RetryWorker({ queue, emailLogRepo, identityId: "removals", dailyLimit: 1, handlers: { email: handler } });

    const result = await worker.processReady({ limit: 5 });

    expect(result.processed).toBe(0);
    expect(result.skippedDailyCap).toBe(1);
    expect(handler).not.toHaveBeenCalled();
    expect(retryRepo.get(retryId)).toBeDefined();
  });

  it("requeues transient retry failures and removes permanent failures", async () => {
    const transientId = retryRepo.enqueue({ brokerId: "transient", taskType: "email", payload: {}, errorMessage: "timeout", attemptCount: 1, nextRetryAt: new Date(Date.now() - 1000) });
    const permanentId = retryRepo.enqueue({ brokerId: "permanent", taskType: "web_form", payload: {}, errorMessage: "timeout", attemptCount: 1, nextRetryAt: new Date(Date.now() - 1000) });
    const transientError = new Error("Connection reset");
    (transientError as Error & { code?: string }).code = "ECONNRESET";
    const worker = new RetryWorker({
      queue,
      emailLogRepo,
      identityId: "removals",
      dailyLimit: 10,
      handlers: {
        email: vi.fn().mockRejectedValue(transientError),
        web_form: vi.fn().mockRejectedValue(new Error("Manual form requires user action")),
      },
    });

    const result = await worker.processReady({ limit: 5 });

    expect(result.processed).toBe(2);
    expect(result.requeued).toBe(1);
    expect(result.removed).toBe(1);
    expect(retryRepo.get(transientId)?.attempt_count).toBe(2);
    expect(retryRepo.get(permanentId)).toBeUndefined();
  });

  it("invokes onTaskExhausted exactly when max_attempts is reached and the row is removed", async () => {
    retryRepo.enqueue({
      brokerId: "exhausted",
      taskType: "email",
      payload: { requestId: 42 },
      errorMessage: "timeout",
      attemptCount: 2,
      nextRetryAt: new Date(Date.now() - 1000),
    });
    const transientError = new Error("Connection reset");
    (transientError as Error & { code?: string }).code = "ECONNRESET";
    const onTaskExhausted = vi.fn();
    const worker = new RetryWorker({
      queue,
      emailLogRepo,
      identityId: "removals",
      dailyLimit: 10,
      handlers: { email: vi.fn().mockRejectedValue(transientError) },
      onTaskExhausted,
    });

    const result = await worker.processReady({ limit: 5 });

    expect(result.removed).toBe(1);
    expect(onTaskExhausted).toHaveBeenCalledOnce();
    expect(onTaskExhausted.mock.calls[0][0].payload).toMatchObject({ requestId: 42 });
    expect(onTaskExhausted.mock.calls[0][0].error).toBe(transientError);
  });

  it("does not invoke onTaskExhausted when the failure is requeued (more attempts left)", async () => {
    retryRepo.enqueue({
      brokerId: "still-trying",
      taskType: "email",
      payload: { requestId: 7 },
      errorMessage: "timeout",
      attemptCount: 1,
      nextRetryAt: new Date(Date.now() - 1000),
    });
    const transientError = new Error("Connection reset");
    (transientError as Error & { code?: string }).code = "ECONNRESET";
    const onTaskExhausted = vi.fn();
    const worker = new RetryWorker({
      queue,
      emailLogRepo,
      identityId: "removals",
      dailyLimit: 10,
      handlers: { email: vi.fn().mockRejectedValue(transientError) },
      onTaskExhausted,
    });

    await worker.processReady({ limit: 5 });

    expect(onTaskExhausted).not.toHaveBeenCalled();
  });
});
