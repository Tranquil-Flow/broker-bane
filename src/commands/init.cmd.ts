import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import yaml from "js-yaml";
import { resolveConfigPath } from "../config/loader.js";

const APP_PASSWORD_INSTRUCTIONS: Record<string, string[]> = {
  gmail: [
    "  Gmail App Password setup:",
    "  1. Go to myaccount.google.com → Security → 2-Step Verification (must be enabled)",
    "  2. Scroll down to 'App passwords'",
    "  3. Select app: Mail → Generate",
    "  4. Copy the 16-character password shown (spaces don't matter)",
  ],
  outlook: [
    "  Outlook App Password setup:",
    "  1. Go to account.microsoft.com → Security → Advanced security options",
    "  2. Under 'App passwords', click 'Create a new app password'",
    "  3. Copy the generated password",
  ],
  custom: [
    "  Use the password your email provider gives you for third-party apps.",
    "  Check your provider's documentation for 'SMTP app password' or 'email client password'.",
  ],
};

export async function initCommand(): Promise<void> {
  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BrokerBane Setup Wizard");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nThis wizard creates your config at ~/.brokerbane/config.yaml.");
  console.log("Everything stays on your machine — nothing is uploaded or shared.\n");

  // ── Section 1: Personal profile ────────────────────────────────────────────
  console.log("── Your profile ────────────────────────────────────");
  console.log("This is the information included in your opt-out requests.");
  console.log("More info = better matching (brokers hold records by name + address).\n");

  const profile = await prompt([
    { type: "input", name: "first_name", message: "First name:" },
    { type: "input", name: "last_name",  message: "Last name:" },
    { type: "input", name: "email",      message: "Your email address:" },
    { type: "input", name: "address",    message: "Street address (optional, improves matching):" },
    { type: "input", name: "city",       message: "City (optional):" },
    { type: "input", name: "state",      message: "State, e.g. CA (optional):" },
    { type: "input", name: "zip",        message: "ZIP code (optional):" },
    {
      type: "list",
      name: "country",
      message: "Country:",
      choices: ["US", "UK", "EU", "Other"],
      default: "US",
    },
    { type: "input", name: "phone",         message: "Phone number (optional):" },
    { type: "input", name: "date_of_birth", message: "Date of birth YYYY-MM-DD (optional):" },
  ]);

  // ── Section 2: Email / SMTP ────────────────────────────────────────────────
  console.log("\n── Email account ───────────────────────────────────");
  console.log("BrokerBane sends opt-out emails on your behalf using your email account.");
  console.log("It needs an App Password — a special one-time code, NOT your regular password.\n");

  const { smtpProvider } = await prompt([
    {
      type: "list",
      name: "smtpProvider",
      message: "Which email provider?",
      choices: [
        { name: "Gmail",           value: "gmail" },
        { name: "Outlook/Hotmail", value: "outlook" },
        { name: "Custom SMTP",     value: "custom" },
      ],
    },
  ]);

  // Show provider-specific App Password instructions
  console.log();
  for (const line of APP_PASSWORD_INSTRUCTIONS[smtpProvider] ?? []) {
    console.log(line);
  }
  console.log();

  const smtpCreds = await prompt([
    { type: "input",    name: "user", message: "Email address (login username):" },
    { type: "password", name: "pass", message: "App Password:", mask: "*" },
  ]);

  const smtpDefaults: Record<string, { host: string; port: number }> = {
    gmail:   { host: "smtp.gmail.com",          port: 587 },
    outlook: { host: "smtp-mail.outlook.com",   port: 587 },
    custom:  { host: "",                         port: 587 },
  };

  let smtpHost = smtpDefaults[smtpProvider]?.host ?? "";
  let smtpPort = smtpDefaults[smtpProvider]?.port ?? 587;

  if (smtpProvider === "custom") {
    const custom = await prompt([
      { type: "input",  name: "host", message: "SMTP host (e.g. smtp.fastmail.com):" },
      { type: "number", name: "port", message: "SMTP port:", default: 587 },
    ]);
    smtpHost = custom.host;
    smtpPort = custom.port;
  }

  // ── Section 3: Options ────────────────────────────────────────────────────
  console.log("\n── Preferences ─────────────────────────────────────\n");

  const options = await prompt([
    {
      type: "list",
      name: "template",
      message: "Which legal template should emails use?",
      choices: [
        {
          name: "GDPR  — European law, strongest rights (good for everyone, not just EU residents)",
          value: "gdpr",
        },
        {
          name: "CCPA  — California law, good for US residents",
          value: "ccpa",
        },
        {
          name: "Generic — mentions both laws, works anywhere",
          value: "generic",
        },
      ],
      default: "gdpr",
    },
    {
      type: "confirm",
      name: "verify_before_send",
      message: "Check that you're actually listed on a broker's site before emailing them?\n  (Requires Stagehand browser API key — skip for now if unsure)",
      default: false,
    },
  ]);

  // ── Section 4: IMAP inbox monitoring (optional) ───────────────────────────
  console.log("\n── Inbox monitoring (optional) ─────────────────────");
  console.log("Some brokers send a confirmation email asking you to click a link to complete");
  console.log("your opt-out. BrokerBane can monitor your inbox and click those links for you.");
  console.log("This is optional — you can always click them manually.\n");

  const { imapEnabled } = await prompt([
    {
      type: "confirm",
      name: "imapEnabled",
      message: "Set up automatic confirmation link clicking?",
      default: false,
    },
  ]);

  let imapConfig: Record<string, unknown> | undefined;
  if (imapEnabled) {
    const imapProviderDefaults: Record<string, string> = {
      gmail:   "gmail",
      outlook: "outlook",
      custom:  "custom",
    };
    const defaultImapProvider = imapProviderDefaults[smtpProvider] ?? "custom";

    const { imapProvider } = await prompt([
      {
        type: "list",
        name: "imapProvider",
        message: "IMAP provider (for receiving emails):",
        choices: [
          { name: "Gmail",           value: "gmail" },
          { name: "Outlook/Hotmail", value: "outlook" },
          { name: "Custom IMAP",     value: "custom" },
        ],
        default: defaultImapProvider,
      },
    ]);

    // Suggest same credentials as SMTP when provider matches
    const sameProvider = imapProvider === smtpProvider;
    const defaultUser  = sameProvider ? smtpCreds.user : "";

    const imapCreds = await prompt([
      {
        type: "input",
        name: "user",
        message: "IMAP username (email address):",
        default: defaultUser,
      },
      {
        type: "password",
        name: "pass",
        message: sameProvider
          ? "App Password (press Enter to reuse the same one you entered above):"
          : "App Password for IMAP:",
        mask: "*",
      },
    ]);

    // Fall back to SMTP password if user left IMAP password blank and same provider
    const imapPass = (imapCreds.pass as string).trim() || (sameProvider ? smtpCreds.pass : "");

    const imapHosts: Record<string, { host: string; port: number; secure: boolean }> = {
      gmail:   { host: "imap.gmail.com",        port: 993, secure: true },
      outlook: { host: "outlook.office365.com", port: 993, secure: true },
      custom:  { host: "",                       port: 993, secure: true },
    };

    let imapHost   = imapHosts[imapProvider]?.host   ?? "";
    let imapPort   = imapHosts[imapProvider]?.port   ?? 993;
    let imapSecure = imapHosts[imapProvider]?.secure ?? true;

    if (imapProvider === "custom") {
      const custom = await prompt([
        { type: "input",   name: "host",   message: "IMAP host (e.g. imap.fastmail.com):" },
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
      auth:   { user: imapCreds.user, pass: imapPass },
    };
  }

  // ── Build and write config ────────────────────────────────────────────────
  const config = {
    profile: {
      first_name: profile.first_name,
      last_name:  profile.last_name,
      email:      profile.email,
      ...(profile.address       && { address:       profile.address }),
      ...(profile.city          && { city:          profile.city }),
      ...(profile.state         && { state:         profile.state }),
      ...(profile.zip           && { zip:           profile.zip }),
      country: profile.country,
      ...(profile.phone         && { phone:         profile.phone }),
      ...(profile.date_of_birth && { date_of_birth: profile.date_of_birth }),
      aliases: [],
    },
    email: {
      host:   smtpHost,
      port:   smtpPort,
      secure: false,
      auth: {
        user: smtpCreds.user,
        pass: smtpCreds.pass,
      },
      pool:          true,
      rate_limit:    5,
      rate_delta_ms: 60000,
    },
    options: {
      template:            options.template,
      dry_run:             false,
      regions:             ["us"],
      excluded_brokers:    [],
      tiers:               [1, 2, 3],
      verify_before_send:  options.verify_before_send,
    },
    ...(imapConfig && { inbox: imapConfig }),
    logging: {
      level:      "info",
      redact_pii: true,
    },
  };

  const configPath = resolveConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, yaml.dump(config, { lineWidth: 120 }), { mode: 0o600 });

  console.log(`\n✅  Config saved to ${configPath}`);
  console.log("    File permissions set to 0600 (only you can read it)");
  if (imapConfig) {
    console.log("    Inbox monitoring enabled — confirmation links will be clicked automatically");
  }
  console.log("\nNext steps:");
  console.log("  brokerbane test-config       # Check your SMTP connection works");
  console.log("  brokerbane remove --dry-run  # Preview emails without sending anything");
  console.log("  brokerbane remove            # Send opt-out requests to all brokers\n");
}
