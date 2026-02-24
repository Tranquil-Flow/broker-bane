import { validateTransition, transition, isTerminal, getNextStates } from "../../src/pipeline/state-machine.js";
import { withRetry } from "../../src/pipeline/retry.js";
import { CircuitBreaker } from "../../src/pipeline/circuit-breaker.js";
import { REQUEST_STATUS } from "../../src/types/pipeline.js";
import { StateTransitionError, CircuitBreakerOpenError } from "../../src/util/errors.js";
import Database from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { CircuitBreakerRepo } from "../../src/db/repositories/circuit-breaker.repo.js";

describe("StateMachine", () => {
  it("allows valid transitions", () => {
    expect(validateTransition("pending", "scanning")).toBe(true);
    expect(validateTransition("pending", "sending")).toBe(true);
    expect(validateTransition("sending", "sent")).toBe(true);
    expect(validateTransition("sent", "awaiting_confirmation")).toBe(true);
    expect(validateTransition("confirmed", "completed")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(validateTransition("pending", "completed")).toBe(false);
    expect(validateTransition("completed", "pending")).toBe(false);
    expect(validateTransition("skipped", "pending")).toBe(false);
  });

  it("transition() returns new state for valid", () => {
    const next = transition("pending", "scanning");
    expect(next).toBe("scanning");
  });

  it("transition() throws for invalid", () => {
    expect(() => transition("pending", "completed")).toThrow(StateTransitionError);
  });

  it("identifies terminal states", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("skipped")).toBe(true);
    expect(isTerminal("pending")).toBe(false);
    expect(isTerminal("sending")).toBe(false);
  });

  it("lists next valid states", () => {
    const next = getNextStates("pending");
    expect(next).toContain("scanning");
    expect(next).toContain("sending");
    expect(next).toContain("skipped");
    expect(next).not.toContain("completed");
  });

  it("allows failed -> pending (retry)", () => {
    expect(validateTransition("failed", "pending")).toBe(true);
  });

  it("allows manual_required -> completed", () => {
    expect(validateTransition("manual_required", "completed")).toBe(true);
  });
});

describe("Retry", () => {
  it("succeeds on first attempt", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        return "success";
      },
      { maxAttempts: 3, initialDelayMs: 10, backoffMultiplier: 2, jitter: 0 }
    );
    expect(result).toBe("success");
    expect(calls).toBe(1);
  });

  it("retries on failure then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("fail");
        return "success";
      },
      { maxAttempts: 3, initialDelayMs: 10, backoffMultiplier: 1, jitter: 0 }
    );
    expect(result).toBe("success");
    expect(calls).toBe(3);
  });

  it("throws after max attempts", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("always fails");
        },
        { maxAttempts: 2, initialDelayMs: 10, backoffMultiplier: 1, jitter: 0 }
      )
    ).rejects.toThrow("always fails");
    expect(calls).toBe(2);
  });
});

describe("CircuitBreaker", () => {
  let db: InstanceType<typeof Database>;
  let repo: CircuitBreakerRepo;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new CircuitBreakerRepo(db);
    breaker = new CircuitBreaker(repo, {
      failure_threshold: 3,
      cooldown_ms: 86_400_000,
      half_open_max_attempts: 1,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("starts closed (no record)", () => {
    expect(breaker.getState("test")).toBe("closed");
    expect(breaker.isOpen("test")).toBe(false);
  });

  it("opens after threshold failures", () => {
    breaker.recordFailure("test");
    breaker.recordFailure("test");
    expect(breaker.getState("test")).toBe("closed");

    breaker.recordFailure("test");
    expect(breaker.getState("test")).toBe("open");
    expect(breaker.isOpen("test")).toBe(true);
  });

  it("throws CircuitBreakerOpenError when open", () => {
    breaker.recordFailure("test");
    breaker.recordFailure("test");
    breaker.recordFailure("test");

    expect(() => breaker.check("test")).toThrow(CircuitBreakerOpenError);
  });

  it("resets on success", () => {
    breaker.recordFailure("test");
    breaker.recordFailure("test");
    breaker.recordSuccess("test");
    expect(breaker.getState("test")).toBe("closed");
  });

  it("resets from open on success after cooldown", () => {
    // Simulate: open breaker with expired cooldown
    repo.upsert({
      brokerId: "test",
      state: "open",
      failureCount: 3,
      cooldownUntil: new Date(Date.now() - 1000).toISOString(), // expired
    });

    // check() should transition to half_open
    breaker.check("test");
    expect(breaker.getState("test")).toBe("half_open");

    // Success should reset to closed
    breaker.recordSuccess("test");
    expect(breaker.getState("test")).toBe("closed");
  });
});
