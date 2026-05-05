import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { loadConfig, resolveConfigPath } from "../config/loader.js";
import type { AppConfig, EmailAuth } from "../types/config.js";
import { AppConfigSchema } from "../types/config.js";
import { getEffectiveBrokerIdentity } from "../types/identity.js";

const SAFE_MAX_DAILY_LIMIT = 25;

export interface SettingsEditAnswers {
  first_name: string;
  last_name: string;
  email: string;
  country: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  date_of_birth?: string;
  broker_facing_email: string;
  daily_limit: string | number;
  delay_min_ms: string | number;
  delay_max_ms: string | number;
  dry_run: boolean;
}

export function buildEditedSettingsConfig(config: AppConfig, answers: SettingsEditAnswers): AppConfig {
  const profile = config.profile;
  const oldIdentity = getEffectiveBrokerIdentity(config);
  const profileEmail = answers.email.trim();
  const brokerFacingEmail = answers.broker_facing_email.trim();
  const sameMailbox = brokerFacingEmail.toLowerCase() === profileEmail.toLowerCase();
  const dailyLimit = clampInt(answers.daily_limit, 1, SAFE_MAX_DAILY_LIMIT, config.options.daily_limit ?? 10);
  const delayMinRaw = parseNonNegativeInt(answers.delay_min_ms, config.options.delay_min_ms ?? 5_000);
  const delayMaxRaw = parseNonNegativeInt(answers.delay_max_ms, config.options.delay_max_ms ?? 15_000);
  const delayMin = Math.min(delayMinRaw, delayMaxRaw);
  const delayMax = Math.max(delayMinRaw, delayMaxRaw);

  const updatedProfile = {
    ...profile,
    first_name: answers.first_name.trim(),
    last_name: answers.last_name.trim(),
    email: profileEmail,
    country: answers.country.trim(),
    ...(answers.address?.trim() ? { address: answers.address.trim() } : {}),
    ...(answers.city?.trim() ? { city: answers.city.trim() } : {}),
    ...(answers.state?.trim() ? { state: answers.state.trim() } : {}),
    ...(answers.zip?.trim() ? { zip: answers.zip.trim() } : {}),
    ...(answers.phone?.trim() ? { phone: answers.phone.trim() } : {}),
    ...(answers.date_of_birth?.trim() ? { date_of_birth: answers.date_of_birth.trim() } : {}),
  };

  for (const field of ["address", "city", "state", "zip", "phone", "date_of_birth"] as const) {
    if (!answers[field]?.trim()) {
      delete (updatedProfile as Record<string, unknown>)[field];
    }
  }

  const updatedSmtp: AppConfig["email"] = {
    ...oldIdentity.smtp,
    auth: updateAuthUser(oldIdentity.smtp.auth, brokerFacingEmail),
  };
  const updatedInbox = oldIdentity.inbox
    ? { ...oldIdentity.inbox, auth: updateAuthUser(oldIdentity.inbox.auth, brokerFacingEmail) }
    : undefined;

  const updatedIdentity = {
    ...oldIdentity,
    email: brokerFacingEmail,
    mode: sameMailbox ? "same_mailbox" as const : "dedicated_mailbox" as const,
    privacy_level: sameMailbox ? "legacy" as const : "maximum" as const,
    smtp: updatedSmtp,
    ...(updatedInbox ? { inbox: updatedInbox } : {}),
  };

  return AppConfigSchema.parse({
    ...config,
    profile: updatedProfile,
    email: updatedSmtp,
    ...(config.inbox ? { inbox: updatedInbox ?? config.inbox } : {}),
    broker_identity: updatedIdentity,
    options: {
      ...config.options,
      dry_run: answers.dry_run,
      daily_limit: dailyLimit,
      delay_min_ms: delayMin,
      delay_max_ms: delayMax,
    },
  });
}

function updateAuthUser(auth: EmailAuth, user: string): EmailAuth {
  return { ...auth, user } as EmailAuth;
}

function clampInt(value: string | number, min: number, max: number, fallback: number): number {
  const parsed = parseNonNegativeInt(value, fallback);
  return Math.min(max, Math.max(min, parsed));
}

function parseNonNegativeInt(value: string | number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export async function settingsShowCommand(options: { config?: string }): Promise<void> {
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(options.config);
  const { profile, browser, options: opts } = config;
  const brokerIdentity = getEffectiveBrokerIdentity(config);

  console.log("\n  ━━ BrokerBane Settings ━━\n");

  // Profile
  console.log("  Profile:");
  console.log(`    Name:           ${profile.first_name} ${profile.last_name}`);
  console.log(`    Legal email:    ${profile.email}`);
  console.log(`    Country:        ${profile.country}`);
  console.log(`    Address:        ${profile.address ?? "(not set)"}`);
  console.log(`    City:           ${profile.city ?? "(not set)"}`);
  console.log(`    State:          ${profile.state ?? "(not set)"}`);
  console.log(`    ZIP:            ${profile.zip ?? "(not set)"}`);
  console.log(`    Phone:          ${profile.phone ?? "(not set)"}`);
  console.log(`    Date of birth:  ${profile.date_of_birth ?? "(not set)"}`);
  if (profile.aliases.length > 0) {
    console.log(`    Aliases:        ${profile.aliases.join(", ")}`);
  }

  // Services
  const sameMailbox = brokerIdentity.email.trim().toLowerCase() === profile.email.trim().toLowerCase();
  console.log("\n  Services:");
  console.log(`    Profile/known email:       ${profile.email}`);
  console.log(`    Broker-facing mailbox:    ${brokerIdentity.email}`);
  console.log(`    Broker identity mode:     ${brokerIdentity.mode}`);
  console.log(`    Privacy level:            ${brokerIdentity.privacy_level}`);
  if (sameMailbox) {
    console.log("    Privacy warning:          broker replies go to your profile/main inbox (legacy fallback)");
  }
  console.log(`    SMTP:                     ${brokerIdentity.smtp.host}:${brokerIdentity.smtp.port} (broker-facing)`);
  console.log(`    Confirmation monitoring:  ${brokerIdentity.inbox ? `enabled (${brokerIdentity.inbox.host}:${brokerIdentity.inbox.port})` : "disabled"}`);
  console.log(`    Browser automation:       ${browser.api_key || browser.browserbase_api_key ? "yes" : "no"}`);

  // Options
  console.log("\n  Options:");
  console.log(`    Template:           ${opts.template}`);
  console.log(`    Regions:            ${opts.regions.join(", ")}`);
  console.log(`    Tiers:              ${opts.tiers.join(", ")}`);
  console.log(`    Dry run:            ${opts.dry_run}`);
  console.log(`    Delay:              ${opts.delay_min_ms}–${opts.delay_max_ms} ms`);
  console.log(`    Daily limit:        ${opts.daily_limit ?? "(unlimited)"}`);
  console.log(`    Scan interval:      ${opts.scan_interval_days} days`);

  console.log(`\n  Config file: ${configPath}\n`);
}

export async function settingsEditCommand(options: { config?: string }): Promise<void> {
  const configPath = resolveConfigPath(options.config);
  const config = loadConfig(options.config);
  const { profile, options: opts } = config;
  const brokerIdentity = getEffectiveBrokerIdentity(config);

  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  console.log("\n  ━━ Edit BrokerBane Settings ━━\n");
  console.log("  Press Enter to keep current values.\n");

  const answers = await prompt([
    {
      type: "input",
      name: "first_name",
      message: "First name:",
      default: profile.first_name,
      validate: (v: string) => v.trim().length > 0 || "First name is required",
    },
    {
      type: "input",
      name: "last_name",
      message: "Last name:",
      default: profile.last_name,
      validate: (v: string) => v.trim().length > 0 || "Last name is required",
    },
    {
      type: "input",
      name: "email",
      message: "Known/profile email brokers may use to find records:",
      default: profile.email,
      validate: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email",
    },
    {
      type: "input",
      name: "broker_facing_email",
      message: "Broker-facing removal mailbox:",
      default: brokerIdentity.email,
      validate: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email",
    },
    {
      type: "input",
      name: "country",
      message: "Country (US, UK, EU, ...):",
      default: profile.country,
    },
    {
      type: "input",
      name: "address",
      message: "Street address (optional):",
      default: profile.address ?? "",
    },
    {
      type: "input",
      name: "city",
      message: "City (optional):",
      default: profile.city ?? "",
    },
    {
      type: "input",
      name: "state",
      message: "State (optional):",
      default: profile.state ?? "",
    },
    {
      type: "input",
      name: "zip",
      message: "ZIP code (optional):",
      default: profile.zip ?? "",
    },
    {
      type: "input",
      name: "phone",
      message: "Phone (optional):",
      default: profile.phone ?? "",
    },
    {
      type: "input",
      name: "date_of_birth",
      message: "Date of birth YYYY-MM-DD (optional):",
      default: profile.date_of_birth ?? "",
    },
    {
      type: "input",
      name: "daily_limit",
      message: `Daily send cap (1-${SAFE_MAX_DAILY_LIMIT}):`,
      default: String(opts.daily_limit ?? 10),
      validate: (v: string) => {
        const n = Number.parseInt(v, 10);
        return Number.isInteger(n) && n >= 1 ? true : "Enter a positive whole number";
      },
    },
    {
      type: "input",
      name: "delay_min_ms",
      message: "Minimum pacing delay between sends (ms):",
      default: String(opts.delay_min_ms ?? 5_000),
      validate: (v: string) => {
        const n = Number.parseInt(v, 10);
        return Number.isInteger(n) && n >= 0 ? true : "Enter a non-negative whole number";
      },
    },
    {
      type: "input",
      name: "delay_max_ms",
      message: "Maximum pacing delay between sends (ms):",
      default: String(opts.delay_max_ms ?? 15_000),
      validate: (v: string) => {
        const n = Number.parseInt(v, 10);
        return Number.isInteger(n) && n >= 0 ? true : "Enter a non-negative whole number";
      },
    },
    {
      type: "confirm",
      name: "dry_run",
      message: "Keep dry-run mode enabled by default?",
      default: opts.dry_run,
    },
  ]);

  const updatedConfig = buildEditedSettingsConfig(config, answers as SettingsEditAnswers);

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, yaml.dump(updatedConfig, { lineWidth: 120 }), { mode: 0o600 });

  console.log("\n  ✓ Settings saved.");
  console.log(`  Broker-facing mailbox: ${updatedConfig.broker_identity?.email}`);
  console.log(`  Daily cap: ${updatedConfig.options.daily_limit}`);
  console.log(`  Pacing delay: ${updatedConfig.options.delay_min_ms}–${updatedConfig.options.delay_max_ms} ms\n`);
}
