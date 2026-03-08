import { validateTransition, transition, isTerminal, getNextStates } from "../../src/pipeline/state-machine.js";
import { withRetry } from "../../src/pipeline/retry.js";
import { CircuitBreaker } from "../../src/pipeline/circuit-breaker.js";
import { scheduleBrokers } from "../../src/pipeline/scheduler.js";
import { REQUEST_STATUS } from "../../src/types/pipeline.js";
import type { Broker } from "../../src/types/broker.js";
import { StateTransitionError, CircuitBreakerOpenError } from "../../src/util/errors.js";
import Database from "better-sqlite3";
import { createInMemoryDatabase, createDatabase, closeDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { CircuitBreakerRepo } from "../../src/db/repositories/circuit-breaker.repo.js";
import { EmailLogRepo } from "../../src/db/repositories/email-log.repo.js";
import { Orchestrator } from "../../src/pipeline/orchestrator.js";
import { AppConfigSchema } from "../../src/types/config.js";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";

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

describe("Orchestrator email alias", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `brokerbane-alias-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("uses email.alias as From address when configured", async () => {
    const dbPath = join(tmpDir, "alias-test.db");
    const config = AppConfigSchema.parse({
      profile: {
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        country: "US",
      },
      email: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: { user: "jane@example.com", pass: "testpass" },
        alias: "jane+brokerbane@example.com",
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
      database: { path: dbPath },
    });

    const orchestrator = new Orchestrator(config);
    await orchestrator.run({
      dryRun: true,
      brokerIds: ["zoominfo"],
    });

    // Check the email log for the From address
    const db = createDatabase(dbPath);
    runMigrations(db);
    const emailLogRepo = new EmailLogRepo(db);
    const logs = emailLogRepo.getByRequestId(1);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].from_addr).toBe("jane+brokerbane@example.com");
    closeDatabase(db);

    await orchestrator.cleanup();
  });

  it("falls back to auth.user when no alias is set", async () => {
    const dbPath = join(tmpDir, "noalias-test.db");
    const config = AppConfigSchema.parse({
      profile: {
        first_name: "Jane",
        last_name: "Doe",
        email: "jane@example.com",
        country: "US",
      },
      email: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: { user: "jane@example.com", pass: "testpass" },
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
      database: { path: dbPath },
    });

    const orchestrator = new Orchestrator(config);
    await orchestrator.run({
      dryRun: true,
      brokerIds: ["zoominfo"],
    });

    const db = createDatabase(dbPath);
    runMigrations(db);
    const emailLogRepo = new EmailLogRepo(db);
    const logs = emailLogRepo.getByRequestId(1);
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0].from_addr).toBe("jane@example.com");
    closeDatabase(db);

    await orchestrator.cleanup();
  });
});

function makeBroker(overrides: Partial<Broker> & { id: string }): Broker {
  return {
    name: overrides.id,
    domain: `${overrides.id}.com`,
    region: "us",
    category: "people_search",
    removal_method: "email",
    difficulty: "easy",
    tier: 1,
    requires_captcha: false,
    requires_email_confirm: false,
    requires_id_upload: false,
    public_directory: false,
    verify_before_send: false,
    opt_out_validity_days: 180,
    ...overrides,
  } as Broker;
}

describe("scheduleBrokers parent-company spacing", () => {
  it("spaces apart brokers with the same parent_company", () => {
    // Seed Math.random for deterministic shuffle that would otherwise
    // place all PeopleConnect brokers together
    let callCount = 0;
    const values = [0.1, 0.9, 0.2, 0.8, 0.3, 0.7, 0.4, 0.6, 0.5, 0.5];
    const spy = vi.spyOn(Math, "random").mockImplementation(() => values[callCount++ % values.length]!);

    const brokers = [
      makeBroker({ id: "intelius", parent_company: "PeopleConnect", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "zabasearch", parent_company: "PeopleConnect", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "ussearch", parent_company: "PeopleConnect", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "spokeo", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "whitepages", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "beenverified", tier: 1, difficulty: "easy" }),
    ];

    const scheduled = scheduleBrokers(brokers);
    spy.mockRestore();

    // No two consecutive brokers should share a parent_company
    for (let i = 1; i < scheduled.length; i++) {
      const prev = scheduled[i - 1]!;
      const curr = scheduled[i]!;
      if (prev.parent_company && curr.parent_company) {
        expect(
          prev.parent_company !== curr.parent_company,
          `Consecutive brokers ${prev.id} and ${curr.id} share parent ${prev.parent_company}`
        ).toBe(true);
      }
    }
  });

  it("handles all brokers from same parent gracefully", () => {
    const brokers = [
      makeBroker({ id: "a", parent_company: "SameParent", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "b", parent_company: "SameParent", tier: 1, difficulty: "easy" }),
    ];

    // Should not throw even when spacing is impossible
    const scheduled = scheduleBrokers(brokers);
    expect(scheduled).toHaveLength(2);
  });

  it("uses subsidiary_of for spacing too", () => {
    // Mock Math.random so shuffle produces a deterministic order
    // where parent1 and sub1 end up adjacent before spacing
    let callCount = 0;
    const values = [0.9, 0.1];
    const spy = vi.spyOn(Math, "random").mockImplementation(() => values[callCount++ % values.length]!);

    const brokers = [
      makeBroker({ id: "parent1", parent_company: "BigCorp", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "sub1", subsidiary_of: "BigCorp", tier: 1, difficulty: "easy" }),
      makeBroker({ id: "other", tier: 1, difficulty: "easy" }),
    ];

    const scheduled = scheduleBrokers(brokers);
    spy.mockRestore();

    // parent1 and sub1 should not be adjacent
    for (let i = 1; i < scheduled.length; i++) {
      const prevGroup = scheduled[i - 1]!.parent_company ?? scheduled[i - 1]!.subsidiary_of;
      const currGroup = scheduled[i]!.parent_company ?? scheduled[i]!.subsidiary_of;
      if (prevGroup && currGroup) {
        expect(prevGroup !== currGroup, `${scheduled[i-1]!.id} and ${scheduled[i]!.id} share group`).toBe(true);
      }
    }
  });
});
