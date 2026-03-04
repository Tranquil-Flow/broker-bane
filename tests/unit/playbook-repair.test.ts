import { describe, it, expect, vi } from "vitest";
import { buildRepairPrompt, applyRepair } from "../../src/playbook/repair.js";

describe("PlaybookRepair", () => {
  it("builds a repair prompt with context", () => {
    const prompt = buildRepairPrompt({
      brokerId: "spokeo",
      failedSelector: "input[name='email']",
      stepAction: "fill",
      pageUrl: "https://www.spokeo.com/optout",
      domSnippet: '<div class="form"><input class="opt-out-email" type="email" placeholder="Enter email"></div>',
    });

    expect(prompt).toContain("input[name='email']");
    expect(prompt).toContain("spokeo");
    expect(prompt).toContain("CSS selector");
  });

  it("applyRepair updates the step selector in a playbook", () => {
    const playbook = {
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{
        name: "submit",
        steps: [
          { action: "fill" as const, selector: "input[name='old']", value: "{{email}}" },
          { action: "click" as const, selector: "button.submit" },
        ],
      }],
    };

    const updated = applyRepair(playbook, {
      phase: "submit",
      action: "fill",
      oldSelector: "input[name='old']",
      newSelector: "input.email-field",
    });

    expect(updated.phases[0].steps[0]).toHaveProperty("selector", "input.email-field");
    // Other steps unchanged
    expect(updated.phases[0].steps[1]).toHaveProperty("selector", "button.submit");
    // Version bumped
    expect(updated.version).toBe(2);
  });
});
