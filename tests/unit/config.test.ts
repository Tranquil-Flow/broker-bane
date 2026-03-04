import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeFileSync, mkdirSync, rmSync, chmodSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import yaml from "js-yaml";
import { loadConfig, checkConfigPermissions } from "../../src/config/loader.js";
import { AppConfigSchema } from "../../src/types/config.js";

function makeMinimalConfig(): Record<string, unknown> {
  return {
    profile: {
      first_name: "Jane",
      last_name: "Doe",
      email: "jane@example.com",
      country: "US",
    },
    email: {
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "jane@example.com", pass: "app-password" },
    },
  };
}

describe("Config loader", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `brokerbane-config-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("loadConfig", () => {
    it("loads a valid config file", () => {
      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, yaml.dump(makeMinimalConfig()), { mode: 0o600 });

      const config = loadConfig(configPath);
      expect(config.profile.first_name).toBe("Jane");
      expect(config.profile.last_name).toBe("Doe");
      expect(config.email.host).toBe("smtp.gmail.com");
    });

    it("applies schema defaults for missing optional sections", () => {
      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, yaml.dump(makeMinimalConfig()), { mode: 0o600 });

      const config = loadConfig(configPath);
      expect(config.options.template).toBe("gdpr");
      expect(config.options.dry_run).toBe(false);
      expect(config.retry.max_attempts).toBe(3);
      expect(config.logging.level).toBe("info");
      expect(config.logging.redact_pii).toBe(true);
    });

    it("throws ConfigError when file does not exist", () => {
      expect(() => loadConfig(join(tmpDir, "nonexistent.yaml"))).toThrow("Config file not found");
    });

    it("throws ConfigError when YAML is invalid", () => {
      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, "{ this is: [invalid yaml", { mode: 0o600 });
      expect(() => loadConfig(configPath)).toThrow("Failed to parse config file");
    });

    it("throws ConfigError when required fields are missing", () => {
      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, yaml.dump({ profile: { first_name: "Jane" } }), { mode: 0o600 });
      expect(() => loadConfig(configPath)).toThrow("Invalid config");
    });

    it("expands ~ in database.path", () => {
      const configPath = join(tmpDir, "config.yaml");
      const cfg = { ...makeMinimalConfig(), database: { path: "~/.brokerbane/test.db" } };
      writeFileSync(configPath, yaml.dump(cfg), { mode: 0o600 });

      const config = loadConfig(configPath);
      expect(config.database.path).not.toContain("~");
      expect(config.database.path).toContain(".brokerbane/test.db");
    });
  });

  describe("checkConfigPermissions", () => {
    it("does not warn for 0600 permissions", () => {
      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, "test", { mode: 0o600 });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      checkConfigPermissions(configPath);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it("warns for world-readable permissions (0644)", () => {
      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, "test", { mode: 0o644 });

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      checkConfigPermissions(configPath);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("chmod 600"));
      warnSpy.mockRestore();
    });

    it("does not throw for nonexistent file", () => {
      expect(() => checkConfigPermissions(join(tmpDir, "ghost.yaml"))).not.toThrow();
    });
  });

  describe("init config output format", () => {
    it("written config is parseable and validates correctly", () => {
      // Simulate what init writes
      const initConfig = {
        profile: {
          first_name: "Alice",
          last_name: "Smith",
          email: "alice@example.com",
          city: "Portland",
          state: "OR",
          country: "US",
          aliases: [],
        },
        email: {
          host: "smtp.gmail.com",
          port: 587,
          secure: false,
          auth: { user: "alice@gmail.com", pass: "test-app-pass" },
          pool: true,
          rate_limit: 5,
          rate_delta_ms: 60000,
        },
        options: {
          template: "gdpr",
          dry_run: false,
          regions: ["us"],
          excluded_brokers: [],
          tiers: [1, 2, 3],
          verify_before_send: false,
        },
        logging: { level: "info", redact_pii: true },
      };

      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, yaml.dump(initConfig, { lineWidth: 120 }), { mode: 0o600 });

      // Verify permissions
      const mode = statSync(configPath).mode & 0o777;
      expect(mode).toBe(0o600);

      // Verify it loads cleanly
      const config = loadConfig(configPath);
      expect(config.profile.first_name).toBe("Alice");
      expect(config.options.template).toBe("gdpr");
    });

    it("written config with IMAP section validates correctly", () => {
      const initConfigWithImap = {
        ...makeMinimalConfig(),
        inbox: {
          host: "imap.gmail.com",
          port: 993,
          secure: true,
          auth: { user: "jane@gmail.com", pass: "app-pass" },
        },
      };

      const configPath = join(tmpDir, "config.yaml");
      writeFileSync(configPath, yaml.dump(initConfigWithImap), { mode: 0o600 });

      const config = loadConfig(configPath);
      expect(config.inbox?.host).toBe("imap.gmail.com");
      expect(config.inbox?.port).toBe(993);
      expect(config.inbox?.secure).toBe(true);
      expect(config.inbox?.mailbox).toBe("INBOX"); // default
    });
  });
});

describe("Config schema — new fields", () => {
  it("accepts email.provider and email.alias as optional fields", () => {
    const cfg = makeMinimalConfig();
    cfg.email = {
      ...cfg.email as Record<string, unknown>,
      provider: "gmail",
      alias: "jane+brokerbane@gmail.com",
    };
    const parsed = AppConfigSchema.parse(cfg);
    expect(parsed.email.provider).toBe("gmail");
    expect(parsed.email.alias).toBe("jane+brokerbane@gmail.com");
  });

  it("accepts old config without provider/alias fields", () => {
    const cfg = makeMinimalConfig();
    const parsed = AppConfigSchema.parse(cfg);
    expect(parsed.email.provider).toBeUndefined();
    expect(parsed.email.alias).toBeUndefined();
  });

  it("accepts IMAP auth with oauth2 type", () => {
    const cfg = makeMinimalConfig();
    cfg.inbox = {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { type: "oauth2", user: "jane@gmail.com", provider: "google" },
    };
    const parsed = AppConfigSchema.parse(cfg);
    expect(parsed.inbox!.auth.type).toBe("oauth2");
  });

  it("accepts IMAP auth with password type (explicit)", () => {
    const cfg = makeMinimalConfig();
    cfg.inbox = {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { type: "password", user: "jane@gmail.com", pass: "app-pass" },
    };
    const parsed = AppConfigSchema.parse(cfg);
    expect(parsed.inbox!.auth.type).toBe("password");
  });

  it("defaults IMAP auth type to password when type is missing (backwards compat)", () => {
    const cfg = makeMinimalConfig();
    cfg.inbox = {
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: "jane@gmail.com", pass: "app-pass" },
    };
    const parsed = AppConfigSchema.parse(cfg);
    expect(parsed.inbox!.auth.type).toBe("password");
  });
});
