import type { z } from "zod";
import type { AppConfigSchema } from "../types/config.js";

type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export const CONFIG_DIR = "~/.brokerbane";
export const CONFIG_FILE = "config.yaml";
export const DEFAULT_DB_PATH = "~/.brokerbane/brokerbane.db";
export const DEFAULT_SCREENSHOT_DIR = "~/.brokerbane/screenshots";

export const DEFAULT_OPTIONS: DeepPartial<z.infer<typeof AppConfigSchema>> = {
  options: {
    template: "gdpr",
    dry_run: false,
    regions: ["us"],
    excluded_brokers: [],
    tiers: [1, 2, 3],
    delay_min_ms: 5_000,
    delay_max_ms: 15_000,
    verify_before_send: false,
  },
  browser: {
    headless: true,
    model: "gpt-4o",
    provider: "openai",
    timeout_ms: 30_000,
  },
  captcha: {
    provider: "nopecha",
    daily_limit: 95,
  },
  retry: {
    max_attempts: 3,
    initial_delay_ms: 60_000,
    backoff_multiplier: 2,
    jitter: 0.25,
  },
  circuit_breaker: {
    failure_threshold: 3,
    cooldown_ms: 86_400_000,
    half_open_max_attempts: 1,
  },
  matcher: {
    auto_threshold: 60,
    manual_threshold: 40,
  },
  logging: {
    level: "info",
    redact_pii: true,
  },
  database: {
    path: DEFAULT_DB_PATH,
  },
};
