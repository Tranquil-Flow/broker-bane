import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { AppConfigSchema } from "../types/config.js";
import type { AppConfig } from "../types/config.js";
import { ConfigError } from "../util/errors.js";
import { CONFIG_DIR, CONFIG_FILE } from "./defaults.js";

function expandHome(filepath: string): string {
  if (filepath.startsWith("~/")) {
    return join(homedir(), filepath.slice(2));
  }
  return resolve(filepath);
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

  return config;
}

export { expandHome };
