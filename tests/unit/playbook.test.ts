import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PlaybookSchema } from "../../src/playbook/schema.js";
import { resolveTemplateValue } from "../../src/playbook/template.js";
import { loadPlaybook, loadAllPlaybooks } from "../../src/playbook/loader.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import type { Profile } from "../../src/types/config.js";

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

const testProfile: Profile = {
  first_name: "Jane",
  last_name: "Doe",
  email: "jane@example.com",
  address: "123 Main St",
  city: "Springfield",
  state: "IL",
  zip: "62704",
  country: "US",
  phone: "555-0100",
  aliases: [],
};

describe("resolveTemplateValue", () => {
  it("resolves single variable", () => {
    expect(resolveTemplateValue("{{email}}", testProfile)).toBe("jane@example.com");
  });

  it("resolves multiple variables in one string", () => {
    expect(resolveTemplateValue("{{first_name}} {{last_name}}", testProfile))
      .toBe("Jane Doe");
  });

  it("returns literal strings unchanged", () => {
    expect(resolveTemplateValue("hello world", testProfile)).toBe("hello world");
  });

  it("leaves unknown variables as-is", () => {
    expect(resolveTemplateValue("{{unknown}}", testProfile)).toBe("{{unknown}}");
  });

  it("resolves address components", () => {
    expect(resolveTemplateValue("{{address}}, {{city}}, {{state}} {{zip}}", testProfile))
      .toBe("123 Main St, Springfield, IL 62704");
  });
});

describe("PlaybookLoader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `playbook-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads and validates a playbook YAML file", () => {
    const pb = {
      broker_id: "test",
      version: 1,
      last_verified: "2026-03-04",
      phases: [{ name: "submit", steps: [{ action: "goto", url: "https://example.com" }] }],
    };
    writeFileSync(join(tmpDir, "test.yaml"), yaml.dump(pb));

    const loaded = loadPlaybook(join(tmpDir, "test.yaml"));
    expect(loaded.broker_id).toBe("test");
    expect(loaded.phases).toHaveLength(1);
  });

  it("throws on invalid playbook", () => {
    writeFileSync(join(tmpDir, "bad.yaml"), yaml.dump({ broker_id: "x" }));
    expect(() => loadPlaybook(join(tmpDir, "bad.yaml"))).toThrow();
  });

  it("loads all playbooks from a directory", () => {
    for (const id of ["a", "b", "c"]) {
      const pb = {
        broker_id: id,
        version: 1,
        last_verified: "2026-03-04",
        phases: [{ name: "submit", steps: [{ action: "goto", url: "https://example.com" }] }],
      };
      writeFileSync(join(tmpDir, `${id}.yaml`), yaml.dump(pb));
    }

    const all = loadAllPlaybooks(tmpDir);
    expect(all.size).toBe(3);
    expect(all.has("a")).toBe(true);
  });

  it("returns empty map for missing directory", () => {
    const all = loadAllPlaybooks(join(tmpDir, "nonexistent"));
    expect(all.size).toBe(0);
  });
});
