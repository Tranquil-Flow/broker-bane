import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import yaml from "js-yaml";
import { resolveConfigPath } from "../config/loader.js";
import { logger } from "../util/logger.js";

export async function initCommand(): Promise<void> {
  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  console.log("\n🛡️  BrokerBane Setup Wizard\n");
  console.log("This wizard will help you create your configuration file.");
  console.log("Your data stays local -- nothing is uploaded.\n");

  const profile = await prompt([
    { type: "input", name: "first_name", message: "First name:" },
    { type: "input", name: "last_name", message: "Last name:" },
    { type: "input", name: "email", message: "Email address:" },
    { type: "input", name: "address", message: "Street address (optional):" },
    { type: "input", name: "city", message: "City (optional):" },
    { type: "input", name: "state", message: "State (optional):" },
    { type: "input", name: "zip", message: "ZIP code (optional):" },
    {
      type: "list",
      name: "country",
      message: "Country:",
      choices: ["US", "UK", "EU", "Other"],
      default: "US",
    },
    { type: "input", name: "phone", message: "Phone number (optional):" },
    { type: "input", name: "date_of_birth", message: "Date of birth (YYYY-MM-DD, optional):" },
  ]);

  const email = await prompt([
    {
      type: "list",
      name: "provider",
      message: "Email provider:",
      choices: [
        { name: "Gmail", value: "gmail" },
        { name: "Outlook/Hotmail", value: "outlook" },
        { name: "Custom SMTP", value: "custom" },
      ],
    },
    { type: "input", name: "user", message: "Email login (username):" },
    {
      type: "password",
      name: "pass",
      message: "App Password (NOT your regular password):",
      mask: "*",
    },
  ]);

  const smtpDefaults: Record<string, { host: string; port: number }> = {
    gmail: { host: "smtp.gmail.com", port: 587 },
    outlook: { host: "smtp-mail.outlook.com", port: 587 },
    custom: { host: "smtp.example.com", port: 587 },
  };

  let smtpHost = smtpDefaults[email.provider]?.host ?? "smtp.example.com";
  let smtpPort = smtpDefaults[email.provider]?.port ?? 587;

  if (email.provider === "custom") {
    const custom = await prompt([
      { type: "input", name: "host", message: "SMTP host:" },
      { type: "number", name: "port", message: "SMTP port:", default: 587 },
    ]);
    smtpHost = custom.host;
    smtpPort = custom.port;
  }

  const options = await prompt([
    {
      type: "list",
      name: "template",
      message: "Default template:",
      choices: ["gdpr", "ccpa", "generic"],
      default: "gdpr",
    },
    {
      type: "confirm",
      name: "verify_before_send",
      message: "Verify profiles exist before sending removal requests?",
      default: false,
    },
  ]);

  // Optional IMAP inbox monitoring
  const imapSetup = await prompt([
    {
      type: "confirm",
      name: "enabled",
      message: "Set up inbox monitoring? (Auto-clicks confirmation links — optional)",
      default: false,
    },
  ]);

  let imapConfig: Record<string, unknown> | undefined;
  if (imapSetup.enabled) {
    const imapProvider = await prompt([
      {
        type: "list",
        name: "provider",
        message: "IMAP provider:",
        choices: [
          { name: "Gmail", value: "gmail" },
          { name: "Outlook/Hotmail", value: "outlook" },
          { name: "Custom IMAP", value: "custom" },
        ],
      },
      { type: "input", name: "user", message: "IMAP username (usually your email address):" },
      { type: "password", name: "pass", message: "App Password:", mask: "*" },
    ]);

    const imapDefaults: Record<string, { host: string; port: number; secure: boolean }> = {
      gmail:   { host: "imap.gmail.com",           port: 993, secure: true },
      outlook: { host: "outlook.office365.com",    port: 993, secure: true },
      custom:  { host: "",                          port: 993, secure: true },
    };

    let imapHost = imapDefaults[imapProvider.provider]?.host ?? "";
    let imapPort = imapDefaults[imapProvider.provider]?.port ?? 993;
    let imapSecure = imapDefaults[imapProvider.provider]?.secure ?? true;

    if (imapProvider.provider === "custom") {
      const custom = await prompt([
        { type: "input",   name: "host",   message: "IMAP host:" },
        { type: "number",  name: "port",   message: "IMAP port:", default: 993 },
        { type: "confirm", name: "secure", message: "Use TLS (recommended)?", default: true },
      ]);
      imapHost   = custom.host;
      imapPort   = custom.port;
      imapSecure = custom.secure;
    }

    imapConfig = {
      host:   imapHost,
      port:   imapPort,
      secure: imapSecure,
      auth:   { user: imapProvider.user, pass: imapProvider.pass },
    };
  }

  // Build config object
  const config = {
    profile: {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: profile.email,
      ...(profile.address && { address: profile.address }),
      ...(profile.city && { city: profile.city }),
      ...(profile.state && { state: profile.state }),
      ...(profile.zip && { zip: profile.zip }),
      country: profile.country,
      ...(profile.phone && { phone: profile.phone }),
      ...(profile.date_of_birth && { date_of_birth: profile.date_of_birth }),
      aliases: [],
    },
    email: {
      host: smtpHost,
      port: smtpPort,
      secure: false,
      auth: {
        user: email.user,
        pass: email.pass,
      },
      pool: true,
      rate_limit: 5,
      rate_delta_ms: 60000,
    },
    options: {
      template: options.template,
      dry_run: false,
      regions: ["us"],
      excluded_brokers: [],
      tiers: [1, 2, 3],
      verify_before_send: options.verify_before_send,
    },
    ...(imapConfig && { inbox: imapConfig }),
    logging: {
      level: "info",
      redact_pii: true,
    },
  };

  // Write config file
  const configPath = resolveConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });

  const yamlContent = yaml.dump(config, { lineWidth: 120 });
  writeFileSync(configPath, yamlContent, { mode: 0o600 });

  console.log(`\n✅ Config saved to ${configPath}`);
  console.log("   File permissions set to 0600 (owner-only read/write)");
  if (imapConfig) {
    console.log("   Inbox monitoring enabled — confirmation links will be auto-clicked");
  }
  console.log("\nNext steps:");
  console.log("  brokerbane test-config       # Verify your setup");
  console.log("  brokerbane remove --dry-run  # Preview what would be sent");
  console.log("  brokerbane remove            # Send removal requests\n");
}
