import { describe, it, expect } from "vitest";
import { PlaybookSchema } from "../../src/playbook/schema.js";

describe("PlaybookSchema", () => {
  it("validates a minimal playbook with one phase", () => {
    const result = PlaybookSchema.safeParse({
      broker_id: "spokeo",
      version: 1,
      last_verified: "2026-03-04",
      phases: [
        {
          name: "submit",
          steps: [
            { action: "goto", url: "https://www.spokeo.com/optout" },
            { action: "fill", selector: "input[name='email']", value: "{{email}}" },
            { action: "click", selector: "button[type='submit']" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("validates a playbook with search + submit phases", () => {
    const result = PlaybookSchema.safeParse({
      broker_id: "whitepages",
      version: 1,
      last_verified: "2026-03-04",
      phases: [
        {
          name: "search",
          steps: [
            { action: "goto", url: "https://www.whitepages.com/suppression-requests" },
            { action: "fill", selector: "input[name='name']", value: "{{first_name}} {{last_name}}" },
            { action: "click", selector: "button:has-text('Search')" },
            { action: "wait", ms: 3000 },
          ],
        },
        {
          name: "submit",
          steps: [
            { action: "click", selector: "a:has-text('Remove')" },
            { action: "fill", selector: "input[type='email']", value: "{{email}}" },
            { action: "click", selector: "button:has-text('Submit')" },
            { action: "screenshot", label: "success" },
          ],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects playbook with no phases", () => {
    const result = PlaybookSchema.safeParse({
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown action type", () => {
    const result = PlaybookSchema.safeParse({
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{ name: "submit", steps: [{ action: "hover", selector: "div" }] }],
    });
    expect(result.success).toBe(false);
  });

  it("validates all action types", () => {
    const allActions = PlaybookSchema.safeParse({
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{
        name: "submit",
        steps: [
          { action: "goto", url: "https://example.com" },
          { action: "fill", selector: "input", value: "test" },
          { action: "click", selector: "button" },
          { action: "wait", ms: 1000 },
          { action: "wait", selector: "#loaded" },
          { action: "screenshot", label: "done" },
          { action: "select", selector: "select#state", value: "IL" },
          { action: "check", selector: "input[type='checkbox']" },
        ],
      }],
    });
    expect(allActions.success).toBe(true);
  });
});
