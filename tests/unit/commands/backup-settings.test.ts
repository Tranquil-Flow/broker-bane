import { describe, expect, it } from "vitest";
import { configToPortableSettings } from "../../../src/commands/backup.cmd.js";
import { AppConfigSchema } from "../../../src/types/config.js";

function makeConfig() {
  return AppConfigSchema.parse({
    profile: {
      first_name: "Test",
      last_name: "User",
      email: "main@example.com",
    },
    email: {
      host: "smtp.example.com",
      port: 587,
      secure: false,
      auth: { user: "main@example.com", pass: "secret" },
      from: "main@example.com",
    },
    broker_identity: {
      id: "removal-mailbox",
      label: "Dedicated removals",
      mode: "dedicated_mailbox",
      email: "removals@example.com",
      privacy_level: "maximum",
      smtp: {
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: { user: "removals@example.com", pass: "secret" },
        from: "removals@example.com",
      },
    },
    options: {
      daily_limit: 10,
    },
  });
}

describe("backup configToPortableSettings", () => {
  it("includes broker-facing identity fields without credentials", () => {
    const settings = configToPortableSettings(makeConfig());

    expect(settings.broker_identity_email).toBe("removals@example.com");
    expect(settings.broker_identity_mode).toBe("dedicated_mailbox");
    expect(JSON.stringify(settings)).not.toContain("secret");
  });
});
