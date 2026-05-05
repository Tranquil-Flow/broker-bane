import { describe, expect, it } from "vitest";
import { renderStep1Profile } from "../../src/dashboard/views/setup-steps.js";

describe("dashboard setup wizard copy", () => {
  it("separates known profile identifiers from the removal mailbox", () => {
    const html = renderStep1Profile();

    expect(html).toContain("assert your privacy rights");
    expect(html).toContain("Known/profile email");
    expect(html).toContain("used as an identifier in removal demands");
    expect(html).toContain("Removal mailbox email");
    expect(html).toContain("not used as your sending inbox");
  });
});
