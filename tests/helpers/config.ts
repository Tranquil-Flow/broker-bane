import deepmerge from "deepmerge";
import { AppConfigSchema, type AppConfig } from "../../src/types/config.js";

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

const safeDefaults = {
  profile: {
    first_name: "Test",
    last_name: "User",
    email: "profile@example.invalid",
    country: "US",
  },
  email: {
    host: "smtp.example.invalid",
    port: 587,
    secure: false,
    auth: { type: "password", user: "removals@example.invalid", pass: "test-password" },
    alias: "removals@example.invalid",
    pool: false,
    rate_limit: 5,
    rate_delta_ms: 60_000,
  },
  options: {
    template: "gdpr",
    dry_run: true,
    regions: ["us"],
    tiers: [1, 2, 3],
    excluded_brokers: [],
    delay_min_ms: 0,
    delay_max_ms: 0,
    daily_limit: 1,
    verify_before_send: false,
    scan_interval_days: 30,
  },
  database: { path: ":memory:" },
} as const;

const arrayMerge = (_target: unknown[], source: unknown[]): unknown[] => source;

export function createTestConfig(overrides: DeepPartial<AppConfig> = {}): AppConfig {
  const merged = deepmerge(safeDefaults as Record<string, unknown>, overrides as Record<string, unknown>, {
    arrayMerge,
  });
  return AppConfigSchema.parse(merged);
}
