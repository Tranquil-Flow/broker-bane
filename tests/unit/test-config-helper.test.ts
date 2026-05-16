import { describe, it, expect } from "vitest";
import { createTestConfig } from "../helpers/config.js";

describe("createTestConfig", () => {
  it("defaults to safe (dry_run=true, daily_limit=1)", () => {
    const config = createTestConfig();
    expect(config.options.dry_run).toBe(true);
    expect(config.options.daily_limit).toBe(1);
  });

  it("uses an invalid/unroutable broker-facing mailbox by default", () => {
    const config = createTestConfig();
    expect(config.email.host).toBe("smtp.example.invalid");
    expect(config.email.auth.user).toBe("removals@example.invalid");
  });

  it("does not configure an inbox by default", () => {
    const config = createTestConfig();
    expect(config.inbox).toBeUndefined();
  });

  it("requires explicit override to disable dry_run", () => {
    const config = createTestConfig({ options: { dry_run: false } });
    expect(config.options.dry_run).toBe(false);
  });

  it("deep-merges overrides without dropping defaults", () => {
    const config = createTestConfig({ profile: { first_name: "Override" } });
    expect(config.profile.first_name).toBe("Override");
    expect(config.profile.last_name).toBe("User");
    expect(config.profile.email).toBe("profile@example.invalid");
  });

  it("replaces arrays on override instead of concatenating", () => {
    const config = createTestConfig({ options: { tiers: [4] } });
    expect(config.options.tiers).toEqual([4]);
  });
});
