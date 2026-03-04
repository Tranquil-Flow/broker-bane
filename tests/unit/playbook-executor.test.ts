// tests/unit/playbook-executor.test.ts
import { describe, it, expect, vi } from "vitest";
import { PlaybookExecutor } from "../../src/playbook/executor.js";
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
