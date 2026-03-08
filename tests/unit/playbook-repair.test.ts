import { describe, it, expect, vi } from "vitest";
import { buildRepairPrompt, applyRepair, buildFullDomRepairPrompt, validateAndSavePlaybook } from "../../src/playbook/repair.js";

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

describe("buildFullDomRepairPrompt", () => {
  it("includes full DOM context and adjacent step info", () => {
    const prompt = buildFullDomRepairPrompt({
      brokerId: "spokeo",
      failedSelector: "input[name='email']",
      stepAction: "fill",
      pageUrl: "https://www.spokeo.com/optout",
      domSnippet: '<html><body><form><input class="email-input" type="email"></form></body></html>',
      previousStep: { action: "goto", url: "https://www.spokeo.com/optout" },
      nextStep: { action: "click", selector: "button[type='submit']" },
    });

    expect(prompt).toContain("input[name='email']");
    expect(prompt).toContain("spokeo");
    expect(prompt).toContain("Previous step");
    expect(prompt).toContain("Next step");
    expect(prompt).toContain("full page HTML");
  });
});

describe("validateAndSavePlaybook", () => {
  it("returns true for a valid playbook", () => {
    const playbook = {
      broker_id: "test",
      version: 2,
      last_verified: "2026-03-08",
      phases: [{
        name: "submit",
        steps: [
          { action: "goto" as const, url: "https://example.com/optout" },
          { action: "fill" as const, selector: "input[name='email']", value: "{{email}}" },
        ],
      }],
    };

    const result = validateAndSavePlaybook(playbook, "/tmp/test-playbook.yaml", true);
    expect(result).toBe(true);
  });

  it("returns false for an invalid playbook", () => {
    const playbook = {
      broker_id: "",
      version: -1,
      last_verified: "2026-03-08",
      phases: [],
    };

    const result = validateAndSavePlaybook(playbook as any, "/tmp/test.yaml", true);
    expect(result).toBe(false);
  });
});
