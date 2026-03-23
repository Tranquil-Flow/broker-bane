/**
 * Tests for enhanced circuit breaker with per-domain tracking and exponential backoff.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { CircuitBreaker } from "../../src/pipeline/circuit-breaker.js";
import { CircuitBreakerRepo } from "../../src/db/repositories/circuit-breaker.repo.js";
import { DomainCircuitBreakerRepo } from "../../src/db/repositories/domain-circuit-breaker.repo.js";
import { runMigrations } from "../../src/db/migrations.js";
import { CircuitBreakerOpenError } from "../../src/util/errors.js";

function createInMemoryDatabase(): InstanceType<typeof Database> {
  return new Database(":memory:");
}

describe("CircuitBreaker - Domain Tracking", () => {
  let db: InstanceType<typeof Database>;
  let repo: CircuitBreakerRepo;
  let domainRepo: DomainCircuitBreakerRepo;
  let breaker: CircuitBreaker;

  const config = {
    failure_threshold: 3,
    cooldown_ms: 86_400_000, // 24h
    half_open_max_attempts: 1,
  };

  // Map brokers to their domains
  const brokerDomainMap = new Map([
    ["spokeo", "spokeo.com"],
    ["whitepages", "whitepages.com"],
    ["intelius", "peopleconnect.us"], // Same parent company
    ["zabasearch", "peopleconnect.us"], // Same parent company
  ]);

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new CircuitBreakerRepo(db);
    domainRepo = new DomainCircuitBreakerRepo(db);
    breaker = new CircuitBreaker({
      repo,
      domainRepo,
      config,
      brokerDomainMap,
    });
  });

  afterEach(() => {
    db.close();
  });

  describe("per-domain failure tracking", () => {
    it("tracks failures at domain level separately from broker level", () => {
      // Fail intelius (under peopleconnect.us)
      breaker.recordFailure("intelius");
      breaker.recordFailure("intelius");
      breaker.recordFailure("intelius");

      // Broker is open
      expect(breaker.getState("intelius")).toBe("open");
      // Domain should have 3 failures but not yet open (threshold is 2x = 6)
      expect(breaker.getDomainState("peopleconnect.us")).toBe("closed");
    });

    it("opens domain after reaching domain threshold (2x broker threshold)", () => {
      // Fail both brokers under peopleconnect.us
      breaker.recordFailure("intelius");
      breaker.recordFailure("intelius");
      breaker.recordFailure("intelius"); // intelius open
      breaker.recordFailure("zabasearch");
      breaker.recordFailure("zabasearch");
      breaker.recordFailure("zabasearch"); // 6 domain failures

      // Domain should now be open
      expect(breaker.getDomainState("peopleconnect.us")).toBe("open");
      expect(breaker.isDomainOpen("peopleconnect.us")).toBe(true);
    });

    it("domain circuit breaker blocks all brokers on that domain", () => {
      // Open the domain
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "open",
        failureCount: 6,
        consecutiveOpens: 1,
        cooldownUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });

      // Both brokers should be blocked
      expect(breaker.isOpen("intelius")).toBe(true);
      expect(breaker.isOpen("zabasearch")).toBe(true);
      // But spokeo (different domain) should be fine
      expect(breaker.isOpen("spokeo")).toBe(false);
    });

    it("throws CircuitBreakerOpenError with domain info", () => {
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "open",
        failureCount: 6,
        consecutiveOpens: 1,
        cooldownUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });

      try {
        breaker.check("intelius");
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(CircuitBreakerOpenError);
        const cbErr = err as CircuitBreakerOpenError;
        expect(cbErr.identifier).toBe("domain:peopleconnect.us");
        expect(cbErr.message).toContain("peopleconnect.us");
        expect(cbErr.message).toContain("intelius");
      }
    });
  });

  describe("exponential backoff", () => {
    it("first opening uses base cooldown", () => {
      // Force domain open
      for (let i = 0; i < 6; i++) {
        breaker.recordFailure(i < 3 ? "intelius" : "zabasearch");
      }

      const state = domainRepo.get("peopleconnect.us");
      expect(state?.consecutive_opens).toBe(1);
      
      // Cooldown should be base (24h)
      const cooldownEnd = new Date(state!.cooldown_until!);
      const expectedEnd = new Date(Date.now() + config.cooldown_ms);
      // Allow 1 second tolerance
      expect(Math.abs(cooldownEnd.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it("second opening doubles cooldown (exponential backoff)", () => {
      // First: open and then reset the domain
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "closed",
        failureCount: 0,
        consecutiveOpens: 1, // One previous opening
      });

      // Now fail enough to open again
      for (let i = 0; i < 6; i++) {
        breaker.recordFailure(i < 3 ? "intelius" : "zabasearch");
      }

      const state = domainRepo.get("peopleconnect.us");
      expect(state?.consecutive_opens).toBe(2);
      
      // Cooldown should be 2x base (48h)
      const cooldownEnd = new Date(state!.cooldown_until!);
      const expectedEnd = new Date(Date.now() + config.cooldown_ms * 2);
      expect(Math.abs(cooldownEnd.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it("third opening quadruples cooldown", () => {
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "closed",
        failureCount: 0,
        consecutiveOpens: 2, // Two previous openings
      });

      for (let i = 0; i < 6; i++) {
        breaker.recordFailure(i < 3 ? "intelius" : "zabasearch");
      }

      const state = domainRepo.get("peopleconnect.us");
      expect(state?.consecutive_opens).toBe(3);
      
      // Cooldown should be 4x base (96h)
      const cooldownEnd = new Date(state!.cooldown_until!);
      const expectedEnd = new Date(Date.now() + config.cooldown_ms * 4);
      expect(Math.abs(cooldownEnd.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it("cooldown is capped at 7 days", () => {
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "closed",
        failureCount: 0,
        consecutiveOpens: 10, // Many previous openings
      });

      for (let i = 0; i < 6; i++) {
        breaker.recordFailure(i < 3 ? "intelius" : "zabasearch");
      }

      const state = domainRepo.get("peopleconnect.us");
      const cooldownEnd = new Date(state!.cooldown_until!);
      const maxCooldown = 7 * 24 * 60 * 60 * 1000; // 7 days
      const expectedMax = new Date(Date.now() + maxCooldown);
      
      // Should be capped at 7 days
      expect(Math.abs(cooldownEnd.getTime() - expectedMax.getTime())).toBeLessThan(1000);
    });
  });

  describe("domain reset on success", () => {
    it("resets domain circuit breaker on success", () => {
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "open",
        failureCount: 6,
        consecutiveOpens: 2,
        cooldownUntil: new Date(Date.now() - 1000).toISOString(), // expired
      });

      // Successful request should reset domain
      breaker.recordSuccess("intelius");

      expect(breaker.getDomainState("peopleconnect.us")).toBe("closed");
    });

    it("transitions to half_open when cooldown expires", () => {
      domainRepo.upsert({
        domain: "peopleconnect.us",
        state: "open",
        failureCount: 6,
        consecutiveOpens: 2,
        cooldownUntil: new Date(Date.now() - 1000).toISOString(), // expired
      });

      // Check should transition to half_open
      breaker.check("intelius");
      expect(breaker.getDomainState("peopleconnect.us")).toBe("half_open");
    });
  });

  describe("getOpenDomains", () => {
    it("returns list of open domains", () => {
      domainRepo.upsert({
        domain: "domain-a.com",
        state: "open",
        failureCount: 6,
        consecutiveOpens: 1,
        cooldownUntil: new Date(Date.now() + 86_400_000).toISOString(),
      });
      domainRepo.upsert({
        domain: "domain-b.com",
        state: "closed",
        failureCount: 0,
        consecutiveOpens: 0,
      });

      const open = breaker.getOpenDomains();
      expect(open).toContain("domain-a.com");
      expect(open).not.toContain("domain-b.com");
    });
  });
});

describe("CircuitBreaker - Legacy Constructor", () => {
  let db: InstanceType<typeof Database>;
  let repo: CircuitBreakerRepo;
  let breaker: CircuitBreaker;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new CircuitBreakerRepo(db);
    // Use legacy two-arg constructor
    breaker = new CircuitBreaker(repo, {
      failure_threshold: 3,
      cooldown_ms: 86_400_000,
      half_open_max_attempts: 1,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("works without domain tracking", () => {
    breaker.recordFailure("test");
    breaker.recordFailure("test");
    expect(breaker.getState("test")).toBe("closed");

    breaker.recordFailure("test");
    expect(breaker.getState("test")).toBe("open");
    expect(breaker.isOpen("test")).toBe(true);
  });

  it("getOpenDomains returns empty without domain repo", () => {
    expect(breaker.getOpenDomains()).toEqual([]);
  });

  it("getDomainState returns closed without domain repo", () => {
    expect(breaker.getDomainState("any.com")).toBe("closed");
  });
});

describe("DomainCircuitBreakerRepo", () => {
  let db: InstanceType<typeof Database>;
  let repo: DomainCircuitBreakerRepo;

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    repo = new DomainCircuitBreakerRepo(db);
  });

  afterEach(() => {
    db.close();
  });

  it("upsert creates new record", () => {
    repo.upsert({
      domain: "example.com",
      state: "open",
      failureCount: 6,
      consecutiveOpens: 1,
    });

    const state = repo.get("example.com");
    expect(state?.domain).toBe("example.com");
    expect(state?.state).toBe("open");
    expect(state?.failure_count).toBe(6);
    expect(state?.consecutive_opens).toBe(1);
  });

  it("upsert updates existing record", () => {
    repo.upsert({
      domain: "example.com",
      state: "open",
      failureCount: 6,
      consecutiveOpens: 1,
    });
    repo.upsert({
      domain: "example.com",
      state: "closed",
      failureCount: 0,
      consecutiveOpens: 1,
    });

    const state = repo.get("example.com");
    expect(state?.state).toBe("closed");
    expect(state?.failure_count).toBe(0);
  });

  it("reset resets to closed state", () => {
    repo.upsert({
      domain: "example.com",
      state: "open",
      failureCount: 6,
      consecutiveOpens: 2,
      cooldownUntil: new Date().toISOString(),
    });

    repo.reset("example.com");

    const state = repo.get("example.com");
    expect(state?.state).toBe("closed");
    expect(state?.failure_count).toBe(0);
    expect(state?.cooldown_until).toBeNull();
  });

  it("getOpen returns only open domains", () => {
    repo.upsert({
      domain: "open.com",
      state: "open",
      failureCount: 6,
      consecutiveOpens: 1,
    });
    repo.upsert({
      domain: "closed.com",
      state: "closed",
      failureCount: 0,
      consecutiveOpens: 0,
    });

    const open = repo.getOpen();
    expect(open.length).toBe(1);
    expect(open[0]?.domain).toBe("open.com");
  });

  it("getAll returns all records", () => {
    repo.upsert({
      domain: "a.com",
      state: "open",
      failureCount: 6,
      consecutiveOpens: 1,
    });
    repo.upsert({
      domain: "b.com",
      state: "closed",
      failureCount: 0,
      consecutiveOpens: 0,
    });

    const all = repo.getAll();
    expect(all.length).toBe(2);
  });
});
