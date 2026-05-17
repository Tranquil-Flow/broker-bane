import { chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { EmailSender } from "../src/email/sender.js";
import { createDatabase, closeDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrations.js";
import type { AppConfig } from "../src/types/config.js";

export interface DisposableEmailAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number; secure: boolean };
  web?: string;
}

export interface EmailSmokeResult {
  account: DisposableEmailAccount;
  configPath?: string;
  databasePath: string;
  smtpVerified: boolean;
  imapVerified: boolean;
  sqliteVerified: boolean;
  messageId: string;
  previewUrl?: string | false;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args.set(key, true);
    else {
      args.set(key, next);
      i++;
    }
  }
  return {
    json: Boolean(args.get("json")),
    showSecrets: Boolean(args.get("show-secrets")),
    writeConfig: typeof args.get("write-config") === "string" ? String(args.get("write-config")) : undefined,
    databasePath: typeof args.get("database") === "string" ? String(args.get("database")) : join(tmpdir(), `brokerbane-email-smoke-${process.pid}.db`),
  };
}

export function buildDisposableSmokeConfig(account: DisposableEmailAccount, databasePath: string): AppConfig {
  const auth = { type: "password" as const, user: account.user, pass: account.pass };
  const smtp = {
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth,
    provider: "ethereal",
    pool: false,
    rate_limit: 10,
    rate_delta_ms: 1000,
  };
  const inbox = {
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth,
    mailbox: "INBOX",
  };

  return {
    profile: {
      first_name: "BrokerBane",
      last_name: "SmokeTest",
      email: account.user,
      country: "US",
      aliases: [],
    },
    email: smtp,
    inbox,
    broker_identity: {
      id: "ethereal-disposable",
      label: "Ethereal disposable test mailbox",
      mode: "dedicated_mailbox",
      email: account.user,
      provider: "ethereal",
      privacy_level: "maximum",
      smtp,
      inbox,
    },
    options: {
      template: "generic",
      dry_run: true,
      regions: ["us"],
      excluded_brokers: [],
      tiers: [1],
      delay_min_ms: 10,
      delay_max_ms: 20,
      verify_before_send: false,
      scan_interval_days: 30,
      daily_limit: 1,
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
      max_attempts: 1,
      initial_delay_ms: 10,
      backoff_multiplier: 1,
      jitter: 0,
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
      level: "warn",
      redact_pii: true,
    },
    database: {
      path: databasePath,
    },
  };
}

export function redactSmokeResult(result: EmailSmokeResult): EmailSmokeResult {
  return {
    ...result,
    account: {
      ...result.account,
      pass: "[redacted]",
    },
  };
}

async function createDisposableAccount(): Promise<DisposableEmailAccount> {
  const account = await nodemailer.createTestAccount();
  return {
    user: account.user,
    pass: account.pass,
    smtp: { host: account.smtp.host, port: account.smtp.port, secure: account.smtp.secure },
    imap: { host: account.imap.host, port: account.imap.port, secure: account.imap.secure },
    web: account.web,
  };
}

function writeConfig(path: string, config: AppConfig): void {
  writeFileSync(path, yaml.dump(config, { lineWidth: -1, quotingType: '"', forceQuotes: false }), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export async function runDisposableEmailSmoke(options: { writeConfigPath?: string; databasePath?: string } = {}): Promise<EmailSmokeResult> {
  const account = await createDisposableAccount();
  const databasePath = options.databasePath ?? join(tmpdir(), `brokerbane-email-smoke-${process.pid}.db`);
  const config = buildDisposableSmokeConfig(account, databasePath);

  const db = createDatabase(databasePath);
  runMigrations(db);
  closeDatabase(db);

  if (options.writeConfigPath) {
    writeConfig(options.writeConfigPath, config);
  }

  const sender = new EmailSender(config.broker_identity!.smtp, false, config.broker_identity!.id);
  try {
    await sender.verify();
    const info = await sender.send({
      from: account.user,
      to: account.user,
      subject: "BrokerBane disposable email smoke test",
      text: [
        "This is a BrokerBane disposable email smoke test.",
        "It verifies SMTP auth, message creation, and captured-message preview using Ethereal.",
        "No real broker inbox receives this message.",
      ].join("\n"),
    });

    const client = new ImapFlow({
      host: account.imap.host,
      port: account.imap.port,
      secure: account.imap.secure,
      auth: { user: account.user, pass: account.pass },
      logger: false,
    });
    await client.connect();
    await client.logout();

    return {
      account,
      configPath: options.writeConfigPath,
      databasePath,
      smtpVerified: true,
      imapVerified: true,
      sqliteVerified: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl({ messageId: info.messageId, response: info.response } as any),
    };
  } finally {
    await sender.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await runDisposableEmailSmoke({ writeConfigPath: args.writeConfig, databasePath: args.databasePath });
  const printable = args.showSecrets ? result : redactSmokeResult(result);

  if (args.json) {
    console.log(JSON.stringify(printable, null, 2));
    return;
  }

  console.log("\n--- BrokerBane Disposable Email Smoke ---\n");
  console.log(`✅ SQLite migrations verified (${result.databasePath})`);
  console.log(`✅ SMTP verified (${result.account.smtp.host}:${result.account.smtp.port})`);
  console.log(`✅ IMAP verified (${result.account.imap.host}:${result.account.imap.port})`);
  console.log(`✅ Captured test message sent to disposable mailbox`);
  console.log(`   Mailbox: ${result.account.user}`);
  if (result.configPath) console.log(`   Config written: ${result.configPath}`);
  if (result.previewUrl) console.log(`   Ethereal preview: ${result.previewUrl}`);
  if (!args.showSecrets) console.log("\nSecrets redacted. Re-run with --show-secrets only if you intentionally need the disposable password.");
  console.log("No real broker inbox received mail.\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  });
}
