// tests/unit/playbook-executor.test.ts
import { describe, it, expect, vi } from "vitest";
import { PlaybookExecutor } from "../../src/playbook/executor.js";
import { CAPTCHA_TYPE } from "../../src/captcha/detector.js";
import type { Playbook } from "../../src/playbook/schema.js";
import type { Profile } from "../../src/types/config.js";

const testProfile: Profile = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  country: "US",
  aliases: [],
};

function mockPage() {
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    click: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    waitForSelector: vi.fn().mockResolvedValue({}),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("png")),
    selectOption: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    locator: vi.fn().mockReturnValue({
      first: vi.fn().mockReturnValue({
        count: vi.fn().mockResolvedValue(1),
        waitFor: vi.fn().mockResolvedValue(undefined),
      }),
      count: vi.fn().mockResolvedValue(1),
    }),
  };
}

const simplePlaybook: Playbook = {
  broker_id: "test",
  version: 1,
  last_verified: "2026-03-04",
  phases: [{
    name: "submit",
    steps: [
      { action: "goto", url: "https://example.com/optout" },
      { action: "fill", selector: "input[name='email']", value: "{{email}}" },
      { action: "click", selector: "button[type='submit']" },
    ],
  }],
};

describe("PlaybookExecutor", () => {
  it("executes all steps in order", async () => {
    const page = mockPage();
    const executor = new PlaybookExecutor(page as any, testProfile);
    const result = await executor.execute(simplePlaybook);

    expect(result.success).toBe(true);
    expect(page.goto).toHaveBeenCalledWith("https://example.com/optout", expect.any(Object));
    expect(page.fill).toHaveBeenCalledWith("input[name='email']", "jane@example.com");
    expect(page.click).toHaveBeenCalledWith("button[type='submit']");
  });

  it("resolves template variables in fill values", async () => {
    const page = mockPage();
    const executor = new PlaybookExecutor(page as any, testProfile);

    const pb: Playbook = {
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{
        name: "submit",
        steps: [
          { action: "fill", selector: "input", value: "{{first_name}} {{last_name}}" },
        ],
      }],
    };

    await executor.execute(pb);
    expect(page.fill).toHaveBeenCalledWith("input", "Jane Doe");
  });

  it("returns failure when a step throws", async () => {
    const page = mockPage();
    page.goto.mockRejectedValue(new Error("Navigation failed"));
    const executor = new PlaybookExecutor(page as any, testProfile);
    const result = await executor.execute(simplePlaybook);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Navigation failed");
    expect(result.failedStep).toBeDefined();
  });

  it("handles wait with ms", async () => {
    const page = mockPage();
    const executor = new PlaybookExecutor(page as any, testProfile);

    const pb: Playbook = {
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{ name: "submit", steps: [{ action: "wait", ms: 2000 }] }],
    };

    await executor.execute(pb);
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
  });

  it("handles wait with selector", async () => {
    const page = mockPage();
    const executor = new PlaybookExecutor(page as any, testProfile);

    const pb: Playbook = {
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{ name: "submit", steps: [{ action: "wait", selector: "#loaded" }] }],
    };

    await executor.execute(pb);
    expect(page.waitForSelector).toHaveBeenCalledWith("#loaded", expect.any(Object));
  });
});

describe("PlaybookExecutor cookie integration", () => {
  it("completes goto step successfully (cookie integration smoke test)", async () => {
    const mockPageWithCtx = {
      goto: vi.fn().mockResolvedValue(undefined),
      fill: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      waitForSelector: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("img")),
      selectOption: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue(undefined),
      context: vi.fn().mockReturnValue({
        addCookies: vi.fn().mockResolvedValue(undefined),
        cookies: vi.fn().mockResolvedValue([]),
        storageState: vi.fn().mockResolvedValue({ cookies: [], origins: [] }),
      }),
    };

    const executor = new PlaybookExecutor(mockPageWithCtx as any, {
      first_name: "Test",
      last_name: "User",
      email: "test@example.com",
      country: "US",
      aliases: [],
    });

    const result = await executor.execute({
      broker_id: "test-broker",
      version: 1,
      last_verified: "2026-01-01",
      phases: [{
        name: "submit",
        steps: [
          { action: "goto", url: "https://example.com/optout" },
          { action: "screenshot", label: "success" },
        ],
      }],
    });

    expect(result.success).toBe(true);
    expect(mockPageWithCtx.goto).toHaveBeenCalledWith(
      "https://example.com/optout",
      expect.any(Object),
    );
  });
});

describe("PlaybookExecutor CAPTCHA handling", () => {
  it("detects CAPTCHA on step failure and returns captchaBlocked when no solver", async () => {
    const page = mockPage();
    page.click.mockRejectedValue(new Error("Element not found"));

    const executor = new PlaybookExecutor(page as any, testProfile, "/tmp", {
      detectCaptcha: vi.fn().mockResolvedValue({ type: CAPTCHA_TYPE.recaptcha_v2, siteKey: "abc" }),
      solveCaptcha: null,
    });

    const result = await executor.execute(simplePlaybook);

    expect(result.success).toBe(false);
    expect(result.captchaBlocked).toBe(true);
    expect(result.captchaType).toBe("recaptcha_v2");
  });

  it("solves CAPTCHA and retries step when solver is available", async () => {
    const page = mockPage();
    let callCount = 0;
    page.click.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("CAPTCHA blocked");
      // second call succeeds
    });

    const mockSolver = vi.fn().mockResolvedValue({ token: "solved-token", type: "recaptcha_v2" });

    const executor = new PlaybookExecutor(page as any, testProfile, "/tmp", {
      detectCaptcha: vi.fn().mockResolvedValue({ type: CAPTCHA_TYPE.recaptcha_v2, siteKey: "abc" }),
      solveCaptcha: mockSolver,
    });

    const result = await executor.execute(simplePlaybook);

    expect(mockSolver).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it("skips CAPTCHA detection when no captcha hooks provided", async () => {
    const page = mockPage();
    page.click.mockRejectedValue(new Error("Element not found"));

    const executor = new PlaybookExecutor(page as any, testProfile);
    const result = await executor.execute(simplePlaybook);

    expect(result.success).toBe(false);
    expect(result.captchaBlocked).toBeUndefined();
  });

  it("returns captchaBlocked when CAPTCHA detected but solve fails", async () => {
    const page = mockPage();
    page.click.mockRejectedValue(new Error("Element not found"));

    const executor = new PlaybookExecutor(page as any, testProfile, "/tmp", {
      detectCaptcha: vi.fn().mockResolvedValue({ type: CAPTCHA_TYPE.hcaptcha }),
      solveCaptcha: vi.fn().mockResolvedValue(null),
    });

    const result = await executor.execute(simplePlaybook);

    expect(result.success).toBe(false);
    expect(result.captchaBlocked).toBe(true);
  });
});
