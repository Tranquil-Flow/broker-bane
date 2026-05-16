import { describe, it, expect } from "vitest";
import { createRetryHandlers } from "../../src/pipeline/retry-handlers.js";
import { createTestConfig } from "../helpers/config.js";
import { emailBasicBroker } from "../fixtures/brokers.js";
import type { EmailLogRepo } from "../../src/db/repositories/email-log.repo.js";
import type { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";

const stubRequestRepo = {} as RemovalRequestRepo;
const stubEmailLogRepo = {} as EmailLogRepo;

describe("createRetryHandlers (skeleton)", () => {
  it("returns an object with an email handler", () => {
    const handlers = createRetryHandlers({
      config: createTestConfig(),
      brokers: [emailBasicBroker],
      requestRepo: stubRequestRepo,
      emailLogRepo: stubEmailLogRepo,
    });
    expect(typeof handlers.email).toBe("function");
  });

  it("email handler currently throws (skeleton placeholder until Task 5)", async () => {
    const handlers = createRetryHandlers({
      config: createTestConfig(),
      brokers: [emailBasicBroker],
      requestRepo: stubRequestRepo,
      emailLogRepo: stubEmailLogRepo,
    });
    await expect(
      handlers.email!({
        row: {} as never,
        payload: {} as never,
      }),
    ).rejects.toThrow(/not implemented/);
  });
});
