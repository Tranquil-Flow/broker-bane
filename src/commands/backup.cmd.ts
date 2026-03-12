import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { loadConfig, resolveConfigPath } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { exportFromSqlite } from "../portable/adapters/sqlite.js";
import { serialize } from "../portable/serialize.js";
import { readEnvelope } from "../portable/deserialize.js";
import type { PortableSettings } from "../portable/schema.js";
import type { AppConfig } from "../types/config.js";

export interface BackupCommandOptions {
  output?: string;
  exclude?: string[];
  config?: string;
}

function configToPortableSettings(config: AppConfig): PortableSettings {
  return {
    template: config.options.template,
    regions: config.options.regions,
    tiers: config.options.tiers,
    excluded_brokers: config.options.excluded_brokers,
    delay_min_ms: config.options.delay_min_ms,
    delay_max_ms: config.options.delay_max_ms,
    daily_limit: config.options.daily_limit,
    dry_run: config.options.dry_run,
    verify_before_send: config.options.verify_before_send,
    scan_interval_days: config.options.scan_interval_days,
  };
}

function defaultOutputPath(configPath: string): string {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return join(dirname(configPath), `brokerbane-${date}.brokerbane`);
}

export async function backupCommand(options: BackupCommandOptions): Promise<void> {
  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  // Load config and open DB
  const config = loadConfig(options.config);
  const db = createDatabase(config.database.path);
  runMigrations(db);

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  BrokerBane — Create Backup");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Prompt for passphrase with confirmation
  const { passphrase } = await prompt([
    {
      type: "password",
      name: "passphrase",
      message: "Enter passphrase to encrypt backup:",
      mask: "*",
      validate: (v: string) =>
        v.length >= 8 || "Passphrase must be at least 8 characters",
    },
  ]);

  const { passphraseConfirm } = await prompt([
    {
      type: "password",
      name: "passphraseConfirm",
      message: "Confirm passphrase:",
      mask: "*",
    },
  ]);

  if (passphrase !== passphraseConfirm) {
    console.error("  Passphrases do not match. Aborting.");
    closeDatabase(db);
    process.exit(1);
  }

  try {
    // Export data from SQLite
    const profile = config.profile;
    const settings = configToPortableSettings(config);
    const payload = exportFromSqlite(db, { profile, settings });

    // Serialize with passphrase
    const validExcludes = (options.exclude ?? []).filter(
      (e): e is "email_log" | "pipeline_runs" =>
        e === "email_log" || e === "pipeline_runs"
    );

    const json = await serialize(payload, passphrase, {
      source: "cli",
      appVersion: "0.1.0",
      exclude: validExcludes.length > 0 ? validExcludes : undefined,
    });

    // Determine output path
    const configPath = resolveConfigPath(options.config);
    const outputPath = options.output ?? defaultOutputPath(configPath);

    writeFileSync(outputPath, json, { encoding: "utf-8", mode: 0o600 });

    // Print summary
    const summary = JSON.parse(json).summary as Record<string, number>;
    console.log("\n  Backup created successfully!\n");
    console.log(`  File: ${outputPath}`);
    console.log("  Summary:");
    console.log(`    Removal requests : ${summary.removal_requests}`);
    console.log(`    Broker responses : ${summary.broker_responses}`);
    console.log(`    Email log        : ${summary.email_log}`);
    console.log(`    Evidence chain   : ${summary.evidence_chain}`);
    console.log(`    Pending tasks    : ${summary.pending_tasks}`);
    console.log(`    Scan runs        : ${summary.scan_runs}`);
    console.log(`    Pipeline runs    : ${summary.pipeline_runs}`);
    if (validExcludes.length > 0) {
      console.log(`\n  Excluded sections: ${validExcludes.join(", ")}`);
    }
    console.log();
  } finally {
    closeDatabase(db);
  }
}

export async function backupInfoCommand(file: string): Promise<void> {
  let content: string;
  try {
    content = readFileSync(file, "utf-8");
  } catch (err) {
    console.error(`  Cannot read file: ${file}`);
    process.exit(1);
  }

  try {
    const envelope = readEnvelope(content);

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  BrokerBane Backup Info");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`  File    : ${file}`);
    console.log(`  Format  : ${envelope.format}`);
    console.log(`  Version : ${envelope.version}`);
    console.log(`  Created : ${envelope.created_at}`);
    console.log(`  Source  : ${envelope.source}`);
    console.log(`  App     : ${envelope.app_version}`);
    console.log("\n  Contents:");
    console.log(`    Removal requests : ${envelope.summary.removal_requests}`);
    console.log(`    Broker responses : ${envelope.summary.broker_responses}`);
    console.log(`    Email log        : ${envelope.summary.email_log}`);
    console.log(`    Evidence chain   : ${envelope.summary.evidence_chain}`);
    console.log(`    Pending tasks    : ${envelope.summary.pending_tasks}`);
    console.log(`    Scan runs        : ${envelope.summary.scan_runs}`);
    console.log(`    Pipeline runs    : ${envelope.summary.pipeline_runs}`);
    console.log("\n  Encryption:");
    console.log(`    Algorithm : ${envelope.crypto.algorithm}`);
    console.log(`    KDF       : ${envelope.crypto.kdf} (${envelope.crypto.iterations.toLocaleString()} iterations)`);
    console.log();
  } catch (err) {
    console.error(
      `  Invalid or corrupted backup file: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }
}
