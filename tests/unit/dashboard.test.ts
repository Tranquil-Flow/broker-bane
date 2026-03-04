import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Database from "better-sqlite3";
import { createInMemoryDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { RemovalRequestRepo } from "../../src/db/repositories/removal-request.repo.js";
import { PendingTaskRepo } from "../../src/db/repositories/pending-task.repo.js";
import type { AppConfig } from "../../src/types/config.js";
import type { BrokerDatabase } from "../../src/types/broker.js";

// Mock the broker loader to avoid YAML validation issues in tests
const mockBrokerDb: BrokerDatabase = {
  version: "1.0.0",
  brokers: [
    {
      id: "spokeo",
      name: "Spokeo",
      domain: "spokeo.com",
      email: "privacy@spokeo.com",
      region: "us",
      category: "people_search",
      removal_method: "email",
      requires_captcha: false,
      requires_email_confirm: true,
      requires_id_upload: false,
      difficulty: "easy",
      tier: 1,
      public_directory: true,
      verify_before_send: false,
      status: "verified",
    },
    {
      id: "acxiom",
      name: "Acxiom",
      domain: "acxiom.com",
      email: "privacy@acxiom.com",
      region: "us",
      category: "data_broker",
      removal_method: "email",
      requires_captcha: false,
      requires_email_confirm: false,
      requires_id_upload: false,
      difficulty: "medium",
      tier: 2,
      public_directory: false,
      verify_before_send: false,
      status: "verified",
    },
  ],
};

vi.mock("../../src/data/broker-loader.js", () => ({
  loadBrokerDatabase: () => mockBrokerDb,
}));

// Import createDashboardApp after mock is set up
const { createDashboardApp } = await import("../../src/dashboard/server.js");

// Minimal config that satisfies AppConfig shape
const testConfig: AppConfig = {
  profile: {
    first_name: "Test",
    last_name: "User",
    email: "test@example.com",
    country: "US",
    aliases: [],
  },
  email: {
    host: "smtp.example.com",
    port: 587,
    secure: false,
    auth: { type: "password", user: "test@example.com", pass: "testpass" },
    pool: true,
    rate_limit: 5,
    rate_delta_ms: 60_000,
  },
  options: {
    template: "gdpr",
    dry_run: false,
    regions: ["us"],
    excluded_brokers: [],
    tiers: [1, 2, 3],
    delay_min_ms: 5_000,
    delay_max_ms: 15_000,
    verify_before_send: false,
  },
  browser: {
    headless: true,
    model: "gpt-4o",
    provider: "openai",
    timeout_ms: 30_000,
  },
  captcha: {
    provider: "nopecha",
    daily_limit: 95,
  },
  retry: {
    max_attempts: 3,
    initial_delay_ms: 60_000,
    backoff_multiplier: 2,
    jitter: 0.25,
  },
  circuit_breaker: {
    failure_threshold: 3,
    cooldown_ms: 86_400_000,
    half_open_max_attempts: 1,
  },
  matcher: {
    auto_threshold: 60,
    manual_threshold: 40,
  },
  logging: {
    level: "info",
    redact_pii: true,
  },
  database: {
    path: ":memory:",
  },
};

describe("Dashboard", () => {
  let db: InstanceType<typeof Database>;
  let app: ReturnType<typeof createDashboardApp>["app"];

  beforeEach(() => {
    db = createInMemoryDatabase();
    runMigrations(db);
    ({ app } = createDashboardApp(testConfig, db));
  });

  afterEach(() => {
    db.close();
  });

  describe("page routes", () => {
    it("GET / returns 200 and contains BROKERBANE", async () => {
      const res = await app.request("/");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("BROKERBANE");
    });

    it("GET /brokers returns 200", async () => {
      const res = await app.request("/brokers");
      expect(res.status).toBe(200);
    });

    it("GET /tasks returns 200", async () => {
      const res = await app.request("/tasks");
      expect(res.status).toBe(200);
    });

    it("GET /about returns 200 and contains PRIVACY", async () => {
      const res = await app.request("/about");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.toUpperCase()).toContain("PRIVACY");
    });

    it("GET /compare returns 200 and contains DeleteMe", async () => {
      const res = await app.request("/compare");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("DeleteMe");
    });

    it("GET /setup returns 200 and contains COMING SOON", async () => {
      const res = await app.request("/setup");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text.toLowerCase()).toContain("coming soon");
    });
  });

  describe("static assets", () => {
    it("GET /assets/htmx.min.js returns 200 with javascript content-type", async () => {
      const res = await app.request("/assets/htmx.min.js");
      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toContain("javascript");
    });
  });

  describe("API routes", () => {
    it("GET /api/stats returns 200", async () => {
      const res = await app.request("/api/stats");
      expect(res.status).toBe(200);
    });

    it("GET /api/activity returns 200", async () => {
      const res = await app.request("/api/activity");
      expect(res.status).toBe(200);
    });

    it("GET /api/circuit-breakers returns 200", async () => {
      const res = await app.request("/api/circuit-breakers");
      expect(res.status).toBe(200);
    });

    it("POST /api/tasks/:id/complete marks a task done", async () => {
      // Insert test data: a removal request, then a pending task
      const requestRepo = new RemovalRequestRepo(db);
      const taskRepo = new PendingTaskRepo(db);

      const req = requestRepo.create({ brokerId: "spokeo", method: "web_form" });
      const task = taskRepo.create({
        requestId: req.id,
        taskType: "captcha_solve",
        description: "Solve CAPTCHA for spokeo",
      });

      // Verify task is pending
      expect(taskRepo.countPending()).toBe(1);

      // Mark complete via API
      const res = await app.request(`/api/tasks/${task.id}/complete`, {
        method: "POST",
      });
      expect(res.status).toBe(200);

      // Verify task is no longer pending
      expect(taskRepo.countPending()).toBe(0);
    });

    it("GET /api/brokers returns 200", async () => {
      const res = await app.request("/api/brokers");
      expect(res.status).toBe(200);
    });

    it("GET /api/brokers?category=people_search filters correctly", async () => {
      const res = await app.request("/api/brokers?category=people_search");
      expect(res.status).toBe(200);
      const text = await res.text();
      // Our mock has one people_search broker (spokeo) and one data_broker (acxiom)
      // With the filter, only spokeo should appear
      expect(text).toContain("Spokeo");
      expect(text).not.toContain("Acxiom");
    });
  });
});
