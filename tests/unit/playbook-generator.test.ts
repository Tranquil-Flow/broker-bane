import { describe, it, expect, vi } from "vitest";
import { buildGeneratorPrompt, parseGeneratedPlaybook } from "../../src/playbook/generator.js";

describe("buildGeneratorPrompt", () => {
  it("includes broker metadata and form structure", () => {
    const prompt = buildGeneratorPrompt({
      brokerId: "spokeo",
      brokerName: "Spokeo",
      domain: "spokeo.com",
      optOutUrl: "https://www.spokeo.com/optout",
      formHints: "Navigate to spokeo.com/optout. Enter profile URL, then email.",
      formStructure: {
        inputs: [
          { selector: "input[type='text']", type: "text", label: "Profile URL" },
          { selector: "input[type='email']", type: "email", label: "Email" },
        ],
        buttons: [{ selector: "button[type='submit']", type: "submit", text: "Opt Out" }],
        checkboxes: [],
      },
    });

    expect(prompt).toContain("spokeo");
    expect(prompt).toContain("broker_id");
    expect(prompt).toContain("input[type='text']");
    expect(prompt).toContain("{{email}}");
  });
});

describe("parseGeneratedPlaybook", () => {
  it("parses valid YAML into a Playbook", () => {
    const yamlStr = `
broker_id: test-broker
version: 1
last_verified: "2026-03-08"
phases:
  - name: submit
    steps:
      - action: goto
        url: "https://example.com/optout"
      - action: fill
        selector: "input[type='email']"
        value: "{{email}}"
      - action: click
        selector: "button[type='submit']"
      - action: screenshot
        label: success
`;

    const result = parseGeneratedPlaybook(yamlStr);
    expect(result).not.toBeNull();
    expect(result!.broker_id).toBe("test-broker");
    expect(result!.phases[0].steps).toHaveLength(4);
  });

  it("strips markdown fences from LLM output", () => {
    const yamlStr = "```yaml\nbroker_id: test\nversion: 1\nlast_verified: \"2026-03-08\"\nphases:\n  - name: submit\n    steps:\n      - action: goto\n        url: \"https://example.com\"\n```";

    const result = parseGeneratedPlaybook(yamlStr);
    expect(result).not.toBeNull();
    expect(result!.broker_id).toBe("test");
  });

  it("returns null for invalid YAML", () => {
    const result = parseGeneratedPlaybook("not: valid: yaml: [[[");
    expect(result).toBeNull();
  });

  it("returns null for YAML that fails Zod validation", () => {
    const yamlStr = `
broker_id: ""
version: -1
phases: []
`;
    const result = parseGeneratedPlaybook(yamlStr);
    expect(result).toBeNull();
  });
});
