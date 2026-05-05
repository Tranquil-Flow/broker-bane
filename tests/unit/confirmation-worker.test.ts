import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { BrokerResponseRepo } from "../../src/db/repositories/broker-response.repo.js";
import { ConfirmationWorker } from "../../src/inbox/confirmation-worker.js";
import { REQUEST_STATUS } from "../../src/types/pipeline.js";
import type { Broker } from "../../src/types/broker.js";
import type { ImapConfig } from "../../src/types/config.js";
import type { MonitorCallbacks } from "../../src/inbox/monitor.js";

const inbox: ImapConfig = {
  host: "imap.example.test",
  port: 993,
  secure: true,
  auth: { type: "password", user: "removals@example.test", pass: "secret" },
  mailbox: "INBOX",
};

const brokers: Broker[] = [
  {
    id: "alpha",
    name: "Alpha Broker",
    domain: "alpha.example.test",
    removal_method: "email",
    email: "privacy@alpha.example.test",
    regions: ["us"],
    tier: 1,
    estimated_time: "5 minutes",
    requires_id: false,
    has_captcha: false,
    difficulty: "easy",
  },
  {
    id: "beta",
    name: "Beta Broker",
    domain: "beta.example.test",
    removal_method: "email",
    email: "privacy@beta.example.test",
    regions: ["us"],
    tier: 1,
    estimated_time: "5 minutes",
    requires_id: false,
    has_captcha: false,
    difficulty: "easy",
  },
];

describe("ConfirmationWorker", () => {
  let db: InstanceType<typeof Database>;
  let requestRepo: RemovalRequestRepo;
  let responseRepo: BrokerResponseRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    requestRepo = new RemovalRequestRepo(db);
    responseRepo = new BrokerResponseRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("starts a persistent monitor for sent/awaiting broker confirmations and records successful confirmations", async () => {
    const alpha = requestRepo.create({ brokerId: "alpha", method: "email" });
    requestRepo.updateStatus(alpha.id, REQUEST_STATUS.awaiting_confirmation);
    const beta = requestRepo.create({ brokerId: "beta", method: "email" });
    requestRepo.updateStatus(beta.id, REQUEST_STATUS.completed);
    let capturedCallbacks: MonitorCallbacks | undefined;
    const monitor = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), isRunning: vi.fn(() => true) };
    const monitorFactory = vi.fn((_imap, activeBrokers, callbacks) => {
      capturedCallbacks = callbacks;
      expect(activeBrokers.map((broker: Broker) => broker.id)).toEqual(["alpha"]);
      return monitor;
    });
    const worker = new ConfirmationWorker({ inbox, identityId: "removals", brokers, requestRepo, responseRepo, monitorFactory });

    const result = await worker.start();
    capturedCallbacks?.onConfirmation?.("alpha", "https://alpha.example.test/confirm?token=moon", true);

    expect(result.started).toBe(true);
    expect(monitorFactory).toHaveBeenCalledOnce();
    expect(monitor.start).toHaveBeenCalledOnce();
    expect(requestRepo.getById(alpha.id)?.status).toBe(REQUEST_STATUS.confirmed);
    const responses = responseRepo.getByRequestId(alpha.id);
    expect(responses).toHaveLength(1);
    expect(responses[0].confirmation_url).toBe("https://alpha.example.test/confirm?token=moon");
    expect(responses[0].url_domain).toBe("alpha.example.test");
  });

  it("does not start when no inbox config is available", async () => {
    const monitorFactory = vi.fn();
    const worker = new ConfirmationWorker({ inbox: undefined, identityId: "removals", brokers, requestRepo, responseRepo, monitorFactory });

    const result = await worker.start();

    expect(result.started).toBe(false);
    expect(result.reason).toBe("missing_inbox");
    expect(monitorFactory).not.toHaveBeenCalled();
  });

  it("stops the underlying monitor cleanly", async () => {
    const alpha = requestRepo.create({ brokerId: "alpha", method: "email" });
    requestRepo.updateStatus(alpha.id, REQUEST_STATUS.sent);
    const monitor = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined), isRunning: vi.fn(() => false) };
    const worker = new ConfirmationWorker({
      inbox,
      identityId: "removals",
      brokers,
      requestRepo,
      responseRepo,
      monitorFactory: vi.fn(() => monitor),
    });

    await worker.start();
    await worker.stop();

    expect(monitor.stop).toHaveBeenCalledOnce();
  });
});
