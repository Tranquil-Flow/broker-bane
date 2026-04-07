import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { AppConfigSchema } from "../types/config.js";
import type { AppConfig, BrokerIdentityConfig } from "../types/config.js";
import { ConfigError } from "../util/errors.js";
import { CONFIG_DIR, CONFIG_FILE } from "./defaults.js";

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/")) {
    return join(homedir(), filepath.slice(2));
  }
  return resolve(filepath);
}

function inferLegacyBrokerIdentity(config: AppConfig): BrokerIdentityConfig {
  const visibleEmail = config.email.alias ?? config.profile.email;
  const mode = config.email.alias
    ? config.email.alias.includes("+")
      ? "plus_alias"
      : "masked_alias"
    : "same_mailbox";

  return {
    id: "default",
    label: "Imported legacy identity",
    mode,
    email: visibleEmail,
    provider: config.email.provider,
    privacy_level: mode === "same_mailbox" ? "legacy" : "balanced",
    smtp: config.email,
    ...(config.inbox ? { inbox: config.inbox } : {}),
  };
}

export function resolveConfigPath(overridePath?: string): string {
  if (overridePath) return expandHome(overridePath);
  return join(expandHome(CONFIG_DIR), CONFIG_FILE);
}

export function checkConfigPermissions(filepath: string): void {
  try {
    const stats = statSync(filepath);
    const mode = stats.mode & 0o777;
    if (mode & 0o077) {
      console.warn(
        `WARNING: Config file ${filepath} has permissions ${mode.toString(8)}. ` +
          `Consider restricting to 0600 (chmod 600 ${filepath}) to protect sensitive data.`
      );
    }
  } catch {
    // File doesn't exist yet or can't stat -- skip check
  }
}

export function loadConfig(overridePath?: string): AppConfig {
  const configPath = resolveConfigPath(overridePath);

  if (!existsSync(configPath)) {
    throw new ConfigError(
      `Config file not found: ${configPath}. Run 'brokerbane init' to create one.`
    );
  }

  checkConfigPermissions(configPath);

  let raw: unknown;
  try {
    const content = readFileSync(configPath, "utf-8");
    raw = yaml.load(content);
  } catch (err) {
    throw new ConfigError(`Failed to parse config file: ${configPath}`, err);
  }

  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid config:\n${issues}`);
  }

  // Expand home directory in paths
  const config = result.data;
  config.database.path = expandHome(config.database.path);
  config.broker_identity ??= inferLegacyBrokerIdentity(config);

  return config;
}

export function updateConfigField(configPath: string, field: string, value: unknown): void {
  if (!existsSync(configPath)) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

  const content = readFileSync(configPath, "utf-8");
  const raw = yaml.load(content) as Record<string, unknown>;

  // Navigate to the nested field and set the value
  const parts = field.split(".");
  let obj: Record<string, unknown> = raw;
  for (let i = 0; i < parts.length - 1; i++) {
    if (obj[parts[i]] == null || typeof obj[parts[i]] !== "object") {
      obj[parts[i]] = {};
    }
    obj = obj[parts[i]] as Record<string, unknown>;
  }
  obj[parts[parts.length - 1]] = value;

  const newContent = yaml.dump(raw, { lineWidth: -1, quotingType: '"', forceQuotes: false });
  writeFileSync(configPath, newContent, { encoding: "utf-8", mode: 0o600 });
}

export { expandHome };
