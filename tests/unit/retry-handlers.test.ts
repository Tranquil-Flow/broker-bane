import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { EmailLogRepo } from "../../src/db/repositories/email-log.repo.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { createRetryHandlers } from "../../src/pipeline/retry-handlers.js";
import type { EmailRetryPayloadV1 } from "../../src/pipeline/retry-payloads.js";
import type { RetryQueueRow } from "../../src/types/database.js";
import { REQUEST_STATUS } from "../../src/types/pipeline.js";
import { createTestConfig } from "../helpers/config.js";
import { emailBasicBroker } from "../fixtures/brokers.js";

function makeRow(overrides: Partial<RetryQueueRow> = {}): RetryQueueRow {
  return {
    id: 1,
    broker_id: emailBasicBroker.id,
    task_type: "email",
    payload: "{}",
    error_message: null,
    error_code: null,
    attempt_count: 1,
    next_retry_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    last_attempt_at: null,
    ...overrides,
  } as RetryQueueRow;
}

function makePayload(overrides: Partial<EmailRetryPayloadV1> = {}): EmailRetryPayloadV1 {
  return {
    version: 1,
    kind: "email",
    requestId: 1,
    brokerId: emailBasicBroker.id,
    to: emailBasicBroker.email!,
    identityId: "default",
    createdFrom: "orchestrator",
    ...overrides,
  };
}

function createFakeSender() {
  return {
    send: vi.fn().mockResolvedValue({
      messageId: "retry-message-1",
      accepted: [emailBasicBroker.email!],
      rejected: [],
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createRetryHandlers — email", () => {
  let db: InstanceType<typeof Database>;
  let emailLogRepo: EmailLogRepo;
  let requestRepo: RemovalRequestRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    emailLogRepo = new EmailLogRepo(db);
    requestRepo = new RemovalRequestRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("retries an email task using the broker-facing identity", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = createFakeSender();
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    const payload = makePayload({ requestId: request.id });
    await handlers.email!({ row: makeRow(), payload });

    expect(fakeSender.send).toHaveBeenCalledOnce();
    expect(fakeSender.send.mock.calls[0][0]).toMatchObject({
      to: emailBasicBroker.email,
      from: "removals@example.invalid",
    });
    expect(fakeSender.send.mock.calls[0][0].subject).toBeTruthy();
    expect(fakeSender.send.mock.calls[0][0].text).toBeTruthy();

    expect(emailLogRepo.countSentToday("default")).toBe(1);
    expect(requestRepo.getById(request.id)?.status).toBe(REQUEST_STATUS.sent);
    expect(fakeSender.close).toHaveBeenCalledOnce();
  });

  it("uses pre-rendered subject/body from the payload when present", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = createFakeSender();
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await handlers.email!({
      row: makeRow(),
      payload: makePayload({
        requestId: request.id,
        subject: "Cached subject line",
        body: "Cached body content",
      }),
    });

    expect(fakeSender.send.mock.calls[0][0]).toMatchObject({
      subject: "Cached subject line",
      text: "Cached body content",
    });
  });

  it("returns early without sending if request already in a terminal-positive status", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.confirmed);

    const fakeSender = createFakeSender();
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await handlers.email!({
      row: makeRow(),
      payload: makePayload({ requestId: request.id }),
    });

    expect(fakeSender.send).not.toHaveBeenCalled();
    expect(fakeSender.close).not.toHaveBeenCalled();
  });

  it("throws if the request id is unknown", async () => {
    const fakeSender = createFakeSender();
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await expect(
      handlers.email!({
        row: makeRow(),
        payload: makePayload({ requestId: 9999 }),
      }),
    ).rejects.toThrow(/request 9999 not found/);
    expect(fakeSender.send).not.toHaveBeenCalled();
  });

  it("throws if the broker has been removed from the broker list", async () => {
    const request = requestRepo.create({ brokerId: "ghost-broker", method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = createFakeSender();
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await expect(
      handlers.email!({
        row: makeRow(),
        payload: makePayload({ requestId: request.id, brokerId: "ghost-broker" }),
      }),
    ).rejects.toThrow(/broker ghost-broker not found/);
    expect(fakeSender.send).not.toHaveBeenCalled();
  });

  it("throws and logs rejected status when every recipient is rejected", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = {
      send: vi.fn().mockResolvedValue({
        messageId: "retry-rejected-1",
        accepted: [],
        rejected: [emailBasicBroker.email!],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await expect(
      handlers.email!({
        row: makeRow(),
        payload: makePayload({ requestId: request.id }),
      }),
    ).rejects.toThrow(/all recipients rejected/);

    expect(emailLogRepo.getByRequestId(request.id)).toHaveLength(1);
    expect(emailLogRepo.getByRequestId(request.id)[0].status).toBe("rejected");
    expect(requestRepo.getById(request.id)?.status).toBe(REQUEST_STATUS.failed);
    expect(fakeSender.close).toHaveBeenCalledOnce();
  });

  it("treats partial accept as success and transitions request to sent", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = {
      send: vi.fn().mockResolvedValue({
        messageId: "retry-partial-1",
        accepted: [emailBasicBroker.email!],
        rejected: ["unrelated-bounced@example.invalid"],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await handlers.email!({
      row: makeRow(),
      payload: makePayload({ requestId: request.id }),
    });

    expect(requestRepo.getById(request.id)?.status).toBe(REQUEST_STATUS.sent);
    expect(emailLogRepo.getByRequestId(request.id)[0].status).toBe("sent");
  });

  it("passes dryRun=true to the sender factory when configured", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = createFakeSender();
    const senderFactory = vi.fn(() => fakeSender);
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: true } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory,
    });

    await handlers.email!({
      row: makeRow(),
      payload: makePayload({ requestId: request.id }),
    });

    expect(senderFactory).toHaveBeenCalledOnce();
    expect(senderFactory.mock.calls[0][1]).toBe(true);
  });

  it("explicit init.dryRun overrides config.options.dry_run", async () => {
    const request = requestRepo.create({ brokerId: emailBasicBroker.id, method: "email" });
    requestRepo.updateStatus(request.id, REQUEST_STATUS.failed);

    const fakeSender = createFakeSender();
    const senderFactory = vi.fn(() => fakeSender);
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory,
      dryRun: true,
    });

    await handlers.email!({
      row: makeRow(),
      payload: makePayload({ requestId: request.id }),
    });

    expect(senderFactory.mock.calls[0][1]).toBe(true);
  });

  it("rejects malformed payloads without invoking the sender", async () => {
    const fakeSender = createFakeSender();
    const handlers = createRetryHandlers({
      config: createTestConfig({ options: { dry_run: false } }),
      brokers: [emailBasicBroker],
      requestRepo,
      emailLogRepo,
      senderFactory: () => fakeSender,
      dryRun: false,
    });

    await expect(
      handlers.email!({
        row: makeRow(),
        payload: { wrong: "shape" } as never,
      }),
    ).rejects.toThrow(/malformed payload/);
    expect(fakeSender.send).not.toHaveBeenCalled();
  });
});
