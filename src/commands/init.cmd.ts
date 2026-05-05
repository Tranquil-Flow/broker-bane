import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import yaml from "js-yaml";
import { resolveConfigPath } from "../config/loader.js";
import { detectProvider } from "../providers/registry.js";
import type { ProviderConfig } from "../providers/types.js";

export interface InitConfigInput {
  coreProfile: Record<string, string>;
  removalMailbox: string;
  extraProfile: Record<string, string>;
  provider: ProviderConfig | null;
  smtpHost: string;
  smtpPort: number;
  smtpAuthConfig: Record<string, unknown>;
  emailAlias?: string;
  imapConfig?: Record<string, unknown>;
  template: string;
  dailyLimit: number;
}

export function buildInitConfig(input: InitConfigInput): Record<string, unknown> {
  const brokerFacingEmail = input.emailAlias ?? input.removalMailbox;
  const sameMailbox = brokerFacingEmail.trim().toLowerCase() === input.coreProfile.email.trim().toLowerCase();
  const aliasMode = input.emailAlias?.split("@")[0]?.includes("+") ? "plus_alias" : "masked_alias";
  const mode = input.emailAlias ? aliasMode : sameMailbox ? "same_mailbox" : "dedicated_mailbox";
  const privacyLevel = input.emailAlias ? "balanced" : sameMailbox ? "legacy" : "maximum";

  const smtp = {
    host: input.smtpHost,
    port: input.smtpPort,
    secure: false,
    auth: input.smtpAuthConfig,
    ...(input.provider && { provider: input.provider.key }),
    ...(input.emailAlias && { alias: input.emailAlias }),
    pool: true,
    rate_limit: 5,
    rate_delta_ms: 60_000,
  };

  const config = {
    profile: {
      first_name: input.coreProfile.first_name,
      last_name: input.coreProfile.last_name,
      email: input.coreProfile.email,
      ...(input.extraProfile.address && { address: input.extraProfile.address }),
      ...(input.extraProfile.city && { city: input.extraProfile.city }),
      ...(input.extraProfile.state && { state: input.extraProfile.state }),
      ...(input.extraProfile.zip && { zip: input.extraProfile.zip }),
      country: input.coreProfile.country,
      ...(input.extraProfile.phone && { phone: input.extraProfile.phone }),
      ...(input.extraProfile.date_of_birth && { date_of_birth: input.extraProfile.date_of_birth }),
      aliases: [],
    },
    email: smtp,
    broker_identity: {
      id: "default",
      label: "Broker-facing identity",
      mode,
      email: brokerFacingEmail,
      ...(input.provider && { provider: input.provider.key }),
      privacy_level: privacyLevel,
      smtp,
    },
    options: {
      template: input.template,
      dry_run: false,
      regions: ["us"],
      excluded_brokers: [] as string[],
      tiers: [1, 2, 3],
      daily_limit: input.dailyLimit,
      verify_before_send: false,
    },
    // Preserve legacy top-level inbox for backward-compatible commands while
    // also namespacing the same monitor under the broker-facing identity.
    ...(input.imapConfig && { inbox: input.imapConfig }),
    logging: {
      level: "info",
      redact_pii: true,
    },
  };

  if (input.imapConfig) {
    (config.broker_identity as { inbox?: Record<string, unknown> }).inbox = input.imapConfig;
  }

  return config;
}

export async function initCommand(): Promise<void> {
  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BrokerBane Setup Wizard");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nEverything stays on your machine — nothing is uploaded or shared.");
  console.log("For best privacy, use a separate mailbox just for broker removals.\n");

  // ── Step 1: PROFILE ──────────────────────────────────────────────────────
  console.log("── Step 1: Your profile ────────────────────────────");
  console.log("This is the information brokers may use to find your records.");
  console.log("Your broker-facing removal mailbox is collected separately next.\n");

  const coreProfile = await prompt([
    {
      type: "input",
      name: "first_name",
      message: "First name:",
      validate: (v: string) => v.trim().length > 0 || "First name is required",
    },
    {
      type: "input",
      name: "last_name",
      message: "Last name:",
      validate: (v: string) => v.trim().length > 0 || "Last name is required",
    },
    {
      type: "input",
      name: "email",
      message: "Known/profile email brokers may use to find records:",
      validate: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address",
    },
    {
      type: "list",
      name: "country",
      message: "Country:",
      choices: ["US", "UK", "EU", "Other"],
      default: "US",
    },
  ]);

  // ── Step 2: REMOVAL MAILBOX + PROVIDER DETECTION ────────────────────────
  console.log("\n── Step 2: Broker-facing removal mailbox ───────────");
  console.log("Brokers will see this address and send confirmations here.");
  console.log("Use a dedicated removal mailbox or alias when possible; same-mailbox mode is a legacy fallback.\n");

  const { removalMailbox } = await prompt([
    {
      type: "input",
      name: "removalMailbox",
      message: "Broker-facing removal mailbox:",
      default: coreProfile.email,
      validate: (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || "Enter a valid email address",
    },
  ]);

  const provider: ProviderConfig | null = detectProvider(removalMailbox);
  if (provider) {
    console.log(`\n  ✓ Detected: ${provider.name}\n`);
  } else {
    console.log("\n  Custom email provider — you'll need to enter server details manually.\n");
  }

  // Optional extra profile details
  let extraProfile: Record<string, string> = {};
  const { addDetails } = await prompt([
    {
      type: "confirm",
      name: "addDetails",
      message: "Add more details for stronger requests?",
      default: false,
    },
  ]);

  if (addDetails) {
    extraProfile = await prompt([
      { type: "input", name: "address", message: "Street address (optional):" },
      { type: "input", name: "city", message: "City (optional):" },
      { type: "input", name: "state", message: "State, e.g. CA (optional):" },
      { type: "input", name: "zip", message: "ZIP code (optional):" },
      { type: "input", name: "phone", message: "Phone number (optional):" },
      { type: "input", name: "date_of_birth", message: "Date of birth YYYY-MM-DD (optional):" },
    ]);
  }

  // ── Step 3: AUTHENTICATION ───────────────────────────────────────────────
  console.log("\n── Step 3: Email authentication ────────────────────");
  console.log("BrokerBane sends opt-out emails using the mailbox you connect here.");
  console.log("Brokers will see this address, so a dedicated removal mailbox is safest.\n");

  let smtpAuthConfig: Record<string, unknown>;
  let oauthProvider: string | undefined;
  let usedOAuth = false;
  let passwordValue: string | undefined;

  // SMTP host/port — will be filled from provider or prompted for custom
  let smtpHost: string;
  let smtpPort: number;

  if (provider) {
    smtpHost = provider.smtp.host;
    smtpPort = provider.smtp.port;

    if (provider.authMethods.includes("oauth2")) {
      // Provider supports OAuth
      const { authChoice } = await prompt([
        {
          type: "list",
          name: "authChoice",
          message: "How would you like to sign in?",
          choices: [
            { name: `Sign in with ${provider.name} (recommended)`, value: "oauth" },
            { name: "Use an app password instead", value: "password" },
          ],
        },
      ]);

      if (authChoice === "oauth") {
        let oauthSuccess = false;
        while (!oauthSuccess) {
          try {
            if (provider.oauthProvider === "google") {
              const { runGoogleOAuthFlow } = await import("../auth/google-oauth.js");
              await runGoogleOAuthFlow();
            } else {
              const { runMicrosoftOAuthFlow } = await import("../auth/microsoft-oauth.js");
              await runMicrosoftOAuthFlow();
            }
            oauthProvider = provider.oauthProvider;
            smtpAuthConfig = { type: "oauth2", user: removalMailbox, provider: oauthProvider };
            usedOAuth = true;
            oauthSuccess = true;
            console.log(`\n  ✓ Connected via OAuth.\n`);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log(`\n  OAuth failed: ${msg}`);
            const { retry } = await prompt([
              { type: "confirm", name: "retry", message: "Try again?", default: false },
            ]);
            if (!retry) {
              console.log("  Falling back to app password.\n");
              break;
            }
          }
        }
      }

      // Fall through to app password if OAuth wasn't selected or failed
      if (!usedOAuth) {
        smtpAuthConfig = await collectAppPassword(prompt, provider, removalMailbox);
        passwordValue = (smtpAuthConfig as { pass?: string }).pass as string | undefined;
      }
    } else if (provider.authMethods.includes("bridge_password")) {
      // Bridge provider (e.g. ProtonMail)
      if (provider.bridgeInstructions) {
        console.log(`  ${provider.bridgeInstructions}\n`);
      }
      const { bridgePass } = await prompt([
        { type: "password", name: "bridgePass", message: "Bridge password:", mask: "*" },
      ]);
      passwordValue = bridgePass.replace(/\s/g, "");
      smtpAuthConfig = { type: "password", user: removalMailbox, pass: passwordValue };
    } else {
      // App password only (Yahoo, iCloud, etc.)
      smtpAuthConfig = await collectAppPassword(prompt, provider, removalMailbox);
      passwordValue = (smtpAuthConfig as { pass?: string }).pass as string | undefined;
    }
  } else {
    // Custom provider — ask for SMTP details
    const customSmtp = await prompt([
      { type: "input", name: "host", message: "SMTP host (e.g. smtp.fastmail.com):" },
      { type: "number", name: "port", message: "SMTP port:", default: 587 },
      { type: "input", name: "user", message: "Email username:" },
      { type: "password", name: "pass", message: "Password:", mask: "*" },
    ]);
    smtpHost = customSmtp.host;
    smtpPort = customSmtp.port;
    passwordValue = (customSmtp.pass as string).replace(/\s/g, "");
    smtpAuthConfig = { type: "password", user: customSmtp.user, pass: passwordValue };
  }

  // ── Step 4: EMAIL ALIAS ──────────────────────────────────────────────────
  let emailAlias: string | undefined;

  if (provider?.generateAlias) {
    const generatedAlias = provider.generateAlias(removalMailbox);
    console.log("── Step 4: Alias options ───────────────────────────");
    console.log("Optional: add an alias on top of your removal mailbox:");
    console.log(`  ${generatedAlias}`);
    console.log("Replies will still arrive in the removal mailbox you connected.\n");

    const { aliasChoice } = await prompt([
      {
        type: "list",
        name: "aliasChoice",
        message: "Send from:",
        choices: [
          { name: `${generatedAlias} (recommended)`, value: "alias" },
          { name: removalMailbox, value: "real" },
          { name: "Custom alias", value: "custom" },
        ],
      },
    ]);

    if (aliasChoice === "alias") {
      emailAlias = generatedAlias;
    } else if (aliasChoice === "custom") {
      const { customAlias } = await prompt([
        { type: "input", name: "customAlias", message: "Custom alias email:" },
      ]);
      emailAlias = customAlias;
    }
    // "real" => emailAlias stays undefined
  } else if (provider) {
    console.log(`\n  Note: ${provider.name} doesn't support email aliases. Brokers will see your real address.\n`);
  }

  // ── Step 5: IMAP INBOX MONITORING ────────────────────────────────────────
  console.log("── Step 5: Inbox monitoring ────────────────────────");
  console.log("Some brokers send a confirmation email you need to click to complete your opt-out.\n");

  const { imapEnabled } = await prompt([
    {
      type: "confirm",
      name: "imapEnabled",
      message: "Automatically handle broker confirmation emails?",
      default: true,
    },
  ]);

  let imapConfig: Record<string, unknown> | undefined;

  if (imapEnabled) {
    let imapHost: string;
    let imapPort: number;
    let imapAuth: Record<string, unknown>;

    if (usedOAuth && provider) {
      // OAuth was used — reuse it for IMAP, no extra setup
      console.log("  No extra setup needed — we'll use your existing sign-in.\n");
      imapHost = provider.imap.host;
      imapPort = provider.imap.port;
      imapAuth = { type: "oauth2", user: removalMailbox, provider: oauthProvider };
    } else if (provider) {
      // Known provider with password auth — reuse credentials
      console.log("  We'll use the same credentials for inbox monitoring.\n");
      imapHost = provider.imap.host;
      imapPort = provider.imap.port;
      const authUser = typeof smtpAuthConfig!.user === "string" ? (smtpAuthConfig!.user as string) : removalMailbox;
      imapAuth = { type: "password", user: authUser, pass: passwordValue ?? "" };
    } else {
      // Custom provider — ask for IMAP details
      const { reuseSmtp } = await prompt([
        { type: "confirm", name: "reuseSmtp", message: "Reuse SMTP credentials for IMAP?", default: true },
      ]);

      if (reuseSmtp) {
        const customImap = await prompt([
          { type: "input", name: "host", message: "IMAP host (e.g. imap.fastmail.com):" },
          { type: "number", name: "port", message: "IMAP port:", default: 993 },
        ]);
        imapHost = customImap.host;
        imapPort = customImap.port;
        imapAuth = { type: "password", user: smtpAuthConfig!.user as string, pass: passwordValue ?? "" };
      } else {
        const customImap = await prompt([
          { type: "input", name: "host", message: "IMAP host (e.g. imap.fastmail.com):" },
          { type: "number", name: "port", message: "IMAP port:", default: 993 },
          { type: "input", name: "user", message: "IMAP username:" },
          { type: "password", name: "pass", message: "IMAP password:", mask: "*" },
        ]);
        imapHost = customImap.host;
        imapPort = customImap.port;
        imapAuth = { type: "password", user: customImap.user, pass: (customImap.pass as string).replace(/\s/g, "") };
      }
    }

    imapConfig = {
      host: imapHost,
      port: imapPort,
      secure: true,
      auth: imapAuth,
    };
  }

  // ── Step 6: CONNECTION TEST ──────────────────────────────────────────────
  console.log("── Step 6: Connection test ─────────────────────────\n");

  // Build a temporary SmtpConfig-shaped object for the EmailSender
  const smtpConfigForTest = {
    host: smtpHost!,
    port: smtpPort!,
    secure: false,
    auth: smtpAuthConfig!,
    pool: true,
    rate_limit: 5,
    rate_delta_ms: 60_000,
  };

  // SMTP test
  let smtpOk = false;
  while (!smtpOk) {
    try {
      console.log("  Testing connection...");
      const { EmailSender } = await import("../email/sender.js");
      const sender = new EmailSender(smtpConfigForTest as import("../types/config.js").SmtpConfig);
      await sender.verify();
      console.log("  ✓ SMTP connected\n");
      smtpOk = true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ SMTP connection failed: ${msg}`);
      if (provider?.appPasswordUrl) {
        console.log(`    Check your app password at: ${provider.appPasswordUrl}`);
      }
      const { retrySmtp } = await prompt([
        { type: "confirm", name: "retrySmtp", message: "Try again?", default: true },
      ]);
      if (!retrySmtp) {
        console.log("  Skipping SMTP test — you can test later with: brokerbane test-config\n");
        break;
      }
    }
  }

  // IMAP test
  if (imapConfig) {
    let imapOk = false;
    while (!imapOk) {
      try {
        const { ImapFlow } = await import("imapflow");
        const { resolveImapAuth } = await import("../inbox/monitor.js");

        const imapAuth = await resolveImapAuth(imapConfig.auth as import("../types/config.js").EmailAuth);
        const client = new ImapFlow({
          host: imapConfig.host as string,
          port: imapConfig.port as number,
          secure: imapConfig.secure as boolean,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          auth: imapAuth as any,
          logger: false,
        });
        await client.connect();
        await client.logout();
        console.log("  ✓ IMAP connected\n");
        imapOk = true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ IMAP connection failed: ${msg}`);
        const { retryImap } = await prompt([
          { type: "confirm", name: "retryImap", message: "Try again?", default: true },
        ]);
        if (!retryImap) {
          console.log("  Skipping IMAP test — you can test later with: brokerbane test-config\n");
          break;
        }
      }
    }
  }

  // ── Step 7: PREFERENCES ──────────────────────────────────────────────────
  console.log("── Step 7: Preferences ─────────────────────────────\n");

  const templateDefault =
    coreProfile.country === "US" ? "ccpa" : ["UK", "EU"].includes(coreProfile.country) ? "gdpr" : "generic";

  const templateChoices = [
    { name: "GDPR  — European law, strongest rights", value: "gdpr" },
    { name: "CCPA  — California law, good for US residents", value: "ccpa" },
    { name: "Generic — mentions both laws, works anywhere", value: "generic" },
  ].map((c) => ({
    ...c,
    name: c.value === templateDefault ? `${c.name} (recommended)` : c.name,
  }));

  const { template } = await prompt([
    {
      type: "list",
      name: "template",
      message: "Which legal template should emails use?",
      choices: templateChoices,
      default: templateDefault,
    },
  ]);

  const { dailyLimitRaw } = await prompt([
    {
      type: "input",
      name: "dailyLimitRaw",
      message: "Daily removal email cap (10 recommended for a fresh mailbox):",
      default: "10",
      validate: (v: string) => {
        const n = Number.parseInt(v, 10);
        return Number.isFinite(n) && n > 0 || "Enter a positive number";
      },
    },
  ]);
  const dailyLimit = Number.parseInt(dailyLimitRaw, 10);

  // ── Step 8: DONE ─────────────────────────────────────────────────────────
  const config = buildInitConfig({
    coreProfile,
    removalMailbox,
    extraProfile,
    provider,
    smtpHost: smtpHost!,
    smtpPort: smtpPort!,
    smtpAuthConfig: smtpAuthConfig!,
    emailAlias,
    imapConfig,
    template,
    dailyLimit,
  });

  const configPath = resolveConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, yaml.dump(config, { lineWidth: 120 }), { mode: 0o600 });

  console.log("\n✓ Configuration saved!");
  console.log("");
  console.log("Next steps:");
  console.log("  brokerbane remove --dry-run    Preview what would be sent");
  console.log("  brokerbane remove              Start today's privacy-safe batch");
  console.log("  brokerbane remove --resume     Continue tomorrow if the daily cap stops the run\n");
}

// ── Helpers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function collectAppPassword(
  prompt: (...args: any[]) => Promise<Record<string, string>>,
  provider: ProviderConfig,
  email: string,
): Promise<Record<string, unknown>> {
  if (provider.appPasswordPrereq) {
    console.log(`  ${provider.appPasswordPrereq}`);
  }
  if (provider.appPasswordUrl) {
    console.log(`  Generate one at: ${provider.appPasswordUrl}`);
  }
  console.log();

  const { pass } = await prompt([
    { type: "password", name: "pass", message: "App Password:", mask: "*" },
  ]);
  const cleaned = pass.replace(/\s/g, "");
  return { type: "password", user: email, pass: cleaned };
}
