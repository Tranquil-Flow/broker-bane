import { readFileSync } from "node:fs";
import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { readEnvelope, deserialize } from "../portable/deserialize.js";
import { importToSqlite, exportFromSqlite } from "../portable/adapters/sqlite.js";
import { validate } from "../portable/validate.js";
import { diff } from "../portable/diff.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import type { PortablePayload } from "../portable/schema.js";
import type { AppConfig } from "../types/config.js";
import type { PortableSettings } from "../portable/schema.js";

export interface ImportPortableOptions {
  dryRun?: boolean;
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

export async function importPortableCommand(
  file: string,
  options: ImportPortableOptions
): Promise<void> {
  const inquirer = await import("inquirer");
  const prompt = inquirer.default.prompt ?? inquirer.default;

  // Read file
  let fileContent: string;
  try {
    fileContent = readFileSync(file, "utf-8");
  } catch (err) {
    console.error(`  Cannot read file: ${file}`);
    process.exit(1);
  }

  // Show envelope summary without decrypting
  try {
    const envelope = readEnvelope(fileContent);
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  BrokerBane — Import Backup");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`  File    : ${file}`);
    console.log(`  Created : ${envelope.created_at}`);
    console.log(`  Source  : ${envelope.source}  (app v${envelope.app_version})`);
    console.log("  Contents:");
    console.log(`    Removal requests : ${envelope.summary.removal_requests}`);
    console.log(`    Broker responses : ${envelope.summary.broker_responses}`);
    console.log(`    Email log        : ${envelope.summary.email_log}`);
    console.log(`    Evidence chain   : ${envelope.summary.evidence_chain}`);
    console.log(`    Pending tasks    : ${envelope.summary.pending_tasks}`);
    console.log(`    Scan runs        : ${envelope.summary.scan_runs}`);
    console.log(`    Pipeline runs    : ${envelope.summary.pipeline_runs}`);
    console.log();
  } catch (err) {
    console.error(
      `  Invalid backup file: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  // Prompt for passphrase with retry loop
  let payload: PortablePayload | null = null;
  let attempts = 0;
  while (!payload && attempts < 3) {
    const { passphrase } = await prompt([
      {
        type: "password",
        name: "passphrase",
        message: "Enter passphrase:",
        mask: "*",
      },
    ]);
    try {
      payload = await deserialize(fileContent, passphrase);
    } catch {
      attempts++;
      if (attempts < 3) {
        console.log("  Wrong passphrase, try again...");
      } else {
        console.log("  Too many failed attempts.");
        process.exit(1);
      }
    }
  }

  if (!payload) {
    process.exit(1);
  }

  // Validate against known broker IDs
  const brokerDb = loadBrokerDatabase();
  const knownBrokerIds = new Set(brokerDb.brokers.map((b) => b.id));
  const validationResult = validate(payload, knownBrokerIds);

  if (validationResult.warnings.length > 0) {
    console.log("  Validation warnings:");
    for (const w of validationResult.warnings) {
      console.log(`    [${w.type}] ${w.message}`);
    }
    console.log();
  }

  if (validationResult.errors.length > 0) {
    console.error("  Validation errors:");
    for (const e of validationResult.errors) {
      console.error(`    ${e}`);
    }
    process.exit(1);
  }

  // Load config and open DB (needed for merge preview and actual import)
  const config = loadConfig(options.config);
  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    // Prompt for merge vs replace (unless --dry-run)
    let mode: "merge" | "replace" = "merge";

    if (!options.dryRun) {
      const { importMode } = await prompt([
        {
          type: "list",
          name: "importMode",
          message: "Import mode:",
          choices: [
            {
              name: "Merge — add new records, skip duplicates (recommended)",
              value: "merge",
            },
            {
              name: "Replace — clear all existing data and restore from backup",
              value: "replace",
            },
          ],
          default: "merge",
        },
      ]);
      mode = importMode as "merge" | "replace";
    }

    // If merge, show diff preview
    if (mode === "merge" || options.dryRun) {
      const existingSettings = configToPortableSettings(config);
      const existingPayload = exportFromSqlite(db, {
        profile: config.profile,
        settings: existingSettings,
      });

      const diffResult = diff(payload, existingPayload);

      console.log("  Preview (merge):");
      for (const [table, count] of Object.entries(diffResult.added)) {
        const skipped = diffResult.skipped[table] ?? 0;
        console.log(
          `    ${table.padEnd(22)} +${count} new, ${skipped} already exist`
        );
      }

      if (diffResult.conflicts.length > 0) {
        console.log("\n  Profile conflicts:");
        for (const c of diffResult.conflicts) {
          console.log(
            `    ${c.field}: current="${c.currentValue}" vs imported="${c.importedValue}"`
          );
        }
      }
      console.log();
    }

    if (options.dryRun) {
      console.log("  Dry run — no changes applied.\n");
      return;
    }

    // Confirm before replace (destructive)
    if (mode === "replace") {
      const { confirmReplace } = await prompt([
        {
          type: "confirm",
          name: "confirmReplace",
          message:
            "Replace mode will DELETE all existing data. Are you sure?",
          default: false,
        },
      ]);
      if (!confirmReplace) {
        console.log("  Import cancelled.\n");
        return;
      }
    }

    // Perform import
    const result = importToSqlite(db, payload, mode);

    // Print summary
    console.log("  Import complete!\n");
    console.log("  Added:");
    for (const [table, count] of Object.entries(result.added)) {
      if (count > 0) console.log(`    ${table.padEnd(22)} +${count}`);
    }
    if (Object.values(result.added).every((v) => v === 0)) {
      console.log("    (nothing new to add)");
    }

    const totalSkipped = Object.values(result.skipped).reduce((a, b) => a + b, 0);
    if (totalSkipped > 0) {
      console.log(`\n  Skipped ${totalSkipped} duplicate record(s).`);
    }

    if (result.credentialsNeeded) {
      console.log(
        "\n  Note: Email credentials are not included in backups.\n" +
          "  Run 'brokerbane init' or 'brokerbane test-config' to reconfigure email.\n"
      );
    }

    console.log();
  } finally {
    closeDatabase(db);
  }
}
