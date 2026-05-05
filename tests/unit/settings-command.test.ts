import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEditedSettingsConfig, settingsShowCommand } from "../../src/commands/settings.cmd.js";

function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: {
      first_name: "Jane",
      last_name: "Tester",
      email: "jane.personal@example.com",
      country: "US",
      aliases: [],
    },
    email: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { type: "password", user: "jane-removals@gmail.com", pass: "test-pass" },
      pool: true,
      rate_limit: 5,
      rate_delta_ms: 60000,
    },
    broker_identity: {
      id: "default",
      label: "Dedicated removal mailbox",
      mode: "dedicated_mailbox",
      email: "jane-removals@gmail.com",
      provider: "gmail",
      privacy_level: "maximum",
      smtp: {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: { type: "password", user: "jane-removals@gmail.com", pass: "test-pass" },
        provider: "gmail",
        pool: true,
        rate_limit: 5,
        rate_delta_ms: 60000,
      },
      inbox: {
        host: "imap.gmail.com",
        port: 993,
        secure: true,
        auth: { type: "password", user: "jane-removals@gmail.com", pass: "test-pass" },
      },
    },
    options: {
      template: "ccpa",
      dry_run: false,
      regions: ["us"],
      excluded_brokers: [],
      tiers: [1, 2, 3],
      daily_limit: 10,
      delay_min_ms: 5000,
      delay_max_ms: 15000,
      verify_before_send: false,
    },
    logging: { level: "info", redact_pii: true },
    database: { path: "/tmp/brokerbane-settings-test.db" },
    ...overrides,
  };
}

function writeTempConfig(config: Record<string, unknown>): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "brokerbane-settings-"));
  const path = join(dir, "config.yaml");
  writeFileSync(path, yaml.dump(config, { lineWidth: 120 }), { mode: 0o600 });
  chmodSync(path, 0o600);
  return { dir, path };
}

describe("buildEditedSettingsConfig", () => {
  it("updates broker-facing mailbox, daily cap, and pacing while preserving unrelated identity settings", () => {
    const updated = buildEditedSettingsConfig(makeConfig(), {
      first_name: "Jane",
      last_name: "Tester",
      email: "jane.personal@example.com",
      country: "US",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      date_of_birth: "",
      broker_facing_email: "new-removals@example.net",
      daily_limit: "18",
      delay_min_ms: "7000",
      delay_max_ms: "21000",
      dry_run: false,
    });

    expect(updated.profile.email).toBe("jane.personal@example.com");
    expect(updated.broker_identity!.email).toBe("new-removals@example.net");
    expect(updated.broker_identity!.mode).toBe("dedicated_mailbox");
    expect(updated.broker_identity!.privacy_level).toBe("maximum");
    expect(updated.broker_identity!.smtp.auth.user).toBe("new-removals@example.net");
    expect(updated.email.auth.user).toBe("new-removals@example.net");
    expect(updated.broker_identity!.inbox!.auth.user).toBe("new-removals@example.net");
    expect(updated.options.daily_limit).toBe(18);
    expect(updated.options.delay_min_ms).toBe(7000);
    expect(updated.options.delay_max_ms).toBe(21000);
    expect(updated.options.template).toBe("ccpa");
    expect(updated.options.tiers).toEqual([1, 2, 3]);
  });

  it("clamps unsafe daily cap and normalizes reversed pacing values", () => {
    const updated = buildEditedSettingsConfig(makeConfig(), {
      first_name: "Jane",
      last_name: "Tester",
      email: "jane.personal@example.com",
      country: "US",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      date_of_birth: "",
      broker_facing_email: "jane.personal@example.com",
      daily_limit: "1000",
      delay_min_ms: "30000",
      delay_max_ms: "5000",
      dry_run: true,
    });

    expect(updated.broker_identity!.email).toBe("jane.personal@example.com");
    expect(updated.broker_identity!.mode).toBe("same_mailbox");
    expect(updated.broker_identity!.privacy_level).toBe("legacy");
    expect(updated.options.daily_limit).toBe(25);
    expect(updated.options.delay_min_ms).toBe(5000);
    expect(updated.options.delay_max_ms).toBe(30000);
    expect(updated.options.dry_run).toBe(true);
  });
});

describe("settingsShowCommand", () => {
  let tempDir: string | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("shows profile email separately from broker-facing mailbox and pacing diagnostics", async () => {
    const temp = writeTempConfig(makeConfig());
    tempDir = temp.dir;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await settingsShowCommand({ config: temp.path });

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("Profile/known email:       jane.personal@example.com");
    expect(output).toContain("Broker-facing mailbox:    jane-removals@gmail.com");
    expect(output).toContain("Broker identity mode:     dedicated_mailbox");
    expect(output).toContain("Privacy level:            maximum");
    expect(output).toContain("Confirmation monitoring:  enabled (imap.gmail.com:993)");
    expect(output).toContain("Daily limit:        10");
    expect(output).toContain("Delay:              5000–15000 ms");
    expect(output).not.toContain("Privacy warning:");
  });

  it("warns when the broker-facing mailbox is the same as the profile email", async () => {
    const temp = writeTempConfig(
      makeConfig({
        profile: {
          first_name: "Jane",
          last_name: "Tester",
          email: "jane@gmail.com",
          country: "US",
          aliases: [],
        },
        broker_identity: {
          id: "default",
          label: "Same mailbox fallback",
          mode: "same_mailbox",
          email: "jane@gmail.com",
          provider: "gmail",
          privacy_level: "legacy",
          smtp: {
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            auth: { type: "password", user: "jane@gmail.com", pass: "test-pass" },
            provider: "gmail",
            pool: true,
            rate_limit: 5,
            rate_delta_ms: 60000,
          },
        },
      }),
    );
    tempDir = temp.dir;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await settingsShowCommand({ config: temp.path });

    const output = logSpy.mock.calls.map((call) => call.join(" ")).join("\n");
    expect(output).toContain("Broker-facing mailbox:    jane@gmail.com");
    expect(output).toContain("Broker identity mode:     same_mailbox");
    expect(output).toContain("Privacy level:            legacy");
    expect(output).toContain("Privacy warning:          broker replies go to your profile/main inbox (legacy fallback)");
    expect(output).toContain("Confirmation monitoring:  disabled");
  });
});
