import { describe, it, expect } from "vitest";
import { redactPii } from "../../src/util/redact.js";

describe("redactPii", () => {
  it("redacts email addresses", () => {
    const result = redactPii("user jane@gmail.com sent");
    expect(result).not.toContain("jane@gmail.com");
    expect(result).toMatch(/j\*+@g\*+\.com/);
  });

  it("redacts known names", () => {
    const result = redactPii("Name: Jane Doe", { names: ["Jane Doe"] });
    expect(result).not.toContain("Jane");
    expect(result).not.toContain("Doe");
  });

  it("replaces home directory with ~", () => {
    const homedir = process.env.HOME || "/Users/test";
    const result = redactPii(`${homedir}/.brokerbane/config.yaml`);
    expect(result).toBe("~/.brokerbane/config.yaml");
  });

  it("redacts phone numbers", () => {
    const result = redactPii("Phone: 555-123-4567");
    expect(result).not.toContain("555-123-4567");
    expect(result).toContain("[REDACTED]");
  });

  it("leaves non-PII text unchanged", () => {
    const result = redactPii("Node.js v20.0.0 on linux");
    expect(result).toBe("Node.js v20.0.0 on linux");
  });
});
