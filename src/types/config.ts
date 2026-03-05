import { z } from "zod";

export const ProfileSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().email(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().default("US"),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),
  aliases: z.array(z.string()).default([]),
});

const EmailAuthUnion = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("password"),
    user: z.string(),
    pass: z.string(),
  }),
  z.object({
    type: z.literal("oauth2"),
    user: z.string(),
    provider: z.enum(["google", "microsoft"]),
  }),
]);

// Backwards compat: if `type` is absent, assume "password"
export const EmailAuthSchema = z.preprocess(
  (val) => {
    if (val !== null && typeof val === "object" && !("type" in (val as object))) {
      return { type: "password", ...(val as object) };
    }
    return val;
  },
  EmailAuthUnion,
);

export type EmailAuth = z.infer<typeof EmailAuthUnion>;

export const SmtpConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(587),
  secure: z.boolean().default(false),
  auth: EmailAuthSchema,
  provider: z.string().optional(),
  alias: z.string().email().optional(),
  pool: z.boolean().default(true),
  rate_limit: z.number().default(5),
  rate_delta_ms: z.number().default(60_000),
});

export const ImapConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(993),
  secure: z.boolean().default(true),
  auth: EmailAuthSchema,
  mailbox: z.string().default("INBOX"),
});

export const BrowserConfigSchema = z.object({
  headless: z.boolean().default(true),
  model: z.string().default("gpt-4o"),
  provider: z.enum(["openai", "anthropic", "ollama"]).default("openai"),
  api_key: z.string().optional(),
  browserbase_api_key: z.string().optional(),
  browserbase_project_id: z.string().optional(),
  cache_dir: z.string().optional(),
  timeout_ms: z.number().default(30_000),
});

export const CaptchaConfigSchema = z.object({
  provider: z.enum(["nopecha"]).default("nopecha"),
  api_key: z.string().optional(),
  daily_limit: z.number().default(95),
});

export const RetryConfigSchema = z.object({
  max_attempts: z.number().default(3),
  initial_delay_ms: z.number().default(60_000),
  backoff_multiplier: z.number().default(2),
  jitter: z.number().default(0.25),
});

export const CircuitBreakerConfigSchema = z.object({
  failure_threshold: z.number().default(3),
  cooldown_ms: z.number().default(86_400_000), // 24h
  half_open_max_attempts: z.number().default(1),
});

export const MatcherConfigSchema = z.object({
  auto_threshold: z.number().default(60),
  manual_threshold: z.number().default(40),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
  file: z.string().optional(),
  redact_pii: z.boolean().default(true),
});

export const DatabaseConfigSchema = z.object({
  path: z.string().default("~/.brokerbane/brokerbane.db"),
});

export const OptionsConfigSchema = z.object({
  template: z.enum(["gdpr", "ccpa", "generic"]).default("gdpr"),
  dry_run: z.boolean().default(false),
  regions: z.array(z.string()).default(["us"]),
  excluded_brokers: z.array(z.string()).default([]),
  tiers: z.array(z.number()).default([1, 2, 3]),
  delay_min_ms: z.number().default(5_000),
  delay_max_ms: z.number().default(15_000),
  verify_before_send: z.boolean().default(false),
  scan_interval_days: z.number().int().positive().default(30),
});

export const AppConfigSchema = z.object({
  profile: ProfileSchema,
  email: SmtpConfigSchema,
  inbox: ImapConfigSchema.optional(),
  options: OptionsConfigSchema.default({}),
  browser: BrowserConfigSchema.default({}),
  captcha: CaptchaConfigSchema.default({}),
  retry: RetryConfigSchema.default({}),
  circuit_breaker: CircuitBreakerConfigSchema.default({}),
  matcher: MatcherConfigSchema.default({}),
  logging: LoggingConfigSchema.default({}),
  database: DatabaseConfigSchema.default({}),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type SmtpConfig = z.infer<typeof SmtpConfigSchema>;
export type ImapConfig = z.infer<typeof ImapConfigSchema>;
export type BrowserConfig = z.infer<typeof BrowserConfigSchema>;
export type CaptchaConfig = z.infer<typeof CaptchaConfigSchema>;
export type RetryConfig = z.infer<typeof RetryConfigSchema>;
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type MatcherConfig = z.infer<typeof MatcherConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;
