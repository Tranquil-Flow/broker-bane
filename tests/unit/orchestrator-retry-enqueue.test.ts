import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { RetryQueueRepo } from "../../src/db/repositories/retry-queue.repo.js";
import { RetryQueue } from "../../src/pipeline/retry-queue.js";
import { enqueueEmailRetryIfTransient } from "../../src/pipeline/email-retry-enqueue.js";
import { EmailError } from "../../src/util/errors.js";
import { isEmailRetryPayloadV1 } from "../../src/pipeline/retry-payloads.js";
import { emailBasicBroker } from "../fixtures/brokers.js";

describe("enqueueEmailRetryIfTransient", () => {
  let db: InstanceType<typeof Database>;
  let queue: RetryQueue;
  let retryRepo: RetryQueueRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    retryRepo = new RetryQueueRepo(db);
    queue = new RetryQueue(retryRepo, {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 2,
      jitter: 0,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("enqueues a versioned payload when the underlying error is transient (ECONNRESET)", () => {
    const underlying = Object.assign(new Error("connection reset by peer"), { code: "ECONNRESET" });
    const wrapped = new EmailError("Failed to send email", underlying);

    const enqueued = enqueueEmailRetryIfTransient({
      queue,
      broker: emailBasicBroker,
      requestId: 42,
      identityId: "removals",
      rendered: { subject: "Removal request", body: "..." },
      templateName: "gdpr",
      dryRun: false,
      error: wrapped,
    });

    expect(enqueued).toBe(true);
    const rows = retryRepo.getAll();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload);
    expect(isEmailRetryPayloadV1(payload)).toBe(true);
    expect(payload).toMatchObject({
      version: 1,
      kind: "email",
      requestId: 42,
      brokerId: emailBasicBroker.id,
      to: emailBasicBroker.email,
      subject: "Removal request",
      body: "...",
      templateName: "gdpr",
      identityId: "removals",
      createdFrom: "orchestrator",
      originalError: { message: "connection reset by peer", code: "ECONNRESET" },
    });
  });

  it("does NOT enqueue when the underlying error is permanent (EAUTH)", () => {
    const underlying = Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535 });
    const wrapped = new EmailError("Failed to send email", underlying);

    const enqueued = enqueueEmailRetryIfTransient({
      queue,
      broker: emailBasicBroker,
      requestId: 42,
      identityId: "removals",
      rendered: { subject: "Removal request", body: "..." },
      templateName: "gdpr",
      dryRun: false,
      error: wrapped,
    });

    expect(enqueued).toBe(false);
    expect(retryRepo.getAll()).toHaveLength(0);
  });

  it("does NOT enqueue in dry-run mode even on a transient error", () => {
    const underlying = Object.assign(new Error("connection reset by peer"), { code: "ECONNRESET" });
    const wrapped = new EmailError("Failed to send email", underlying);

    const enqueued = enqueueEmailRetryIfTransient({
      queue,
      broker: emailBasicBroker,
      requestId: 42,
      identityId: "removals",
      rendered: { subject: "Removal request", body: "..." },
      templateName: "gdpr",
      dryRun: true,
      error: wrapped,
    });

    expect(enqueued).toBe(false);
    expect(retryRepo.getAll()).toHaveLength(0);
  });

  it("does NOT enqueue when the broker has no email address", () => {
    const underlying = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    const enqueued = enqueueEmailRetryIfTransient({
      queue,
      broker: { ...emailBasicBroker, email: undefined },
      requestId: 42,
      identityId: "removals",
      rendered: { subject: "Removal request", body: "..." },
      templateName: "gdpr",
      dryRun: false,
      error: underlying,
    });

    expect(enqueued).toBe(false);
    expect(retryRepo.getAll()).toHaveLength(0);
  });

  it("classifies a bare nodemailer error (no EmailError wrapping) when called directly", () => {
    const bare = Object.assign(new Error("network timed out"), { code: "ETIMEDOUT" });

    const enqueued = enqueueEmailRetryIfTransient({
      queue,
      broker: emailBasicBroker,
      requestId: 42,
      identityId: "removals",
      rendered: { subject: "Removal request", body: "..." },
      templateName: "gdpr",
      dryRun: false,
      error: bare,
    });

    expect(enqueued).toBe(true);
    const rows = retryRepo.getAll();
    expect(rows).toHaveLength(1);
    const payload = JSON.parse(rows[0].payload);
    expect(payload.originalError).toMatchObject({ code: "ETIMEDOUT" });
  });
});
