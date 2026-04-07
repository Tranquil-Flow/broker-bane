import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { loadConfig, resolveConfigPath } from "../config/loader.js";
import { getEffectiveBrokerIdentity } from "../types/identity.js";

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
  console.log("\n  Services:");
  console.log(`    Broker identity:    ${brokerIdentity.email} [${brokerIdentity.privacy_level}]`);
  console.log(`    SMTP:               ${brokerIdentity.smtp.host}:${brokerIdentity.smtp.port} (broker-facing)`);
  console.log(`    IMAP monitoring:    ${brokerIdentity.inbox ? `${brokerIdentity.inbox.host}:${brokerIdentity.inbox.port}` : "no"}`);
  console.log(`    Browser automation: ${browser.api_key || browser.browserbase_api_key ? "yes" : "no"}`);

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
  const { profile } = config;

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
      message: "Email address:",
      default: profile.email,
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
  ]);

  // Build updated config — keep everything else, replace profile fields
  const updatedProfile = {
    ...profile,
    first_name: answers.first_name.trim(),
    last_name: answers.last_name.trim(),
    email: answers.email.trim(),
    country: answers.country.trim(),
    ...(answers.address.trim() ? { address: answers.address.trim() } : {}),
    ...(answers.city.trim() ? { city: answers.city.trim() } : {}),
    ...(answers.state.trim() ? { state: answers.state.trim() } : {}),
    ...(answers.zip.trim() ? { zip: answers.zip.trim() } : {}),
    ...(answers.phone.trim() ? { phone: answers.phone.trim() } : {}),
    ...(answers.date_of_birth.trim() ? { date_of_birth: answers.date_of_birth.trim() } : {}),
  };

  // Remove optional fields that were cleared
  if (!answers.address.trim()) delete (updatedProfile as Record<string, unknown>).address;
  if (!answers.city.trim()) delete (updatedProfile as Record<string, unknown>).city;
  if (!answers.state.trim()) delete (updatedProfile as Record<string, unknown>).state;
  if (!answers.zip.trim()) delete (updatedProfile as Record<string, unknown>).zip;
  if (!answers.phone.trim()) delete (updatedProfile as Record<string, unknown>).phone;
  if (!answers.date_of_birth.trim()) delete (updatedProfile as Record<string, unknown>).date_of_birth;

  const updatedConfig = { ...config, profile: updatedProfile };

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, yaml.dump(updatedConfig, { lineWidth: 120 }), { mode: 0o600 });

  console.log("\n  ✓ Settings saved.\n");
}
