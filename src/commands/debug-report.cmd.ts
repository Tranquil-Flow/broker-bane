import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";
import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { redactPii } from "../util/redact.js";

export async function debugReportCommand(options: { config?: string; json?: boolean }): Promise<void> {
  const configPath = options.config ?? resolve(os.homedir(), ".brokerbane", "config.yaml");

  let configContent = "(could not load config)";
  let profile = { first_name: "?", last_name: "?", email: "?" };
  let configLoaded = false;

  try {
    const config = loadConfig(options.config);
    profile = config.profile as typeof profile;
    configContent = "(loaded successfully)";
    configLoaded = true;
  } catch (e) {
    configContent = `(error: ${String(e)})`;
  }

  // Get package version
  let appVersion = "unknown";
  try {
    const pkgPath = new URL("../../package.json", import.meta.url).pathname;
    appVersion = JSON.parse(readFileSync(pkgPath, "utf-8")).version as string;
  } catch { /* ignore */ }

  // Config file permissions
  let configPerms = "unknown";
  try {
    const stat = statSync(configPath);
    configPerms = "0" + (stat.mode & 0o777).toString(8);
  } catch { /* ignore */ }

  // SQLite stats
  let dbStats: Record<string, unknown> = {};
  if (configLoaded) {
    try {
      const config = loadConfig(options.config);
      const db = createDatabase((config as { database?: { path?: string } }).database?.path ?? resolve(os.homedir(), ".brokerbane", "brokerbane.db"));
      runMigrations(db);
      const tables = ["removal_requests", "broker_responses", "email_log", "evidence_chain", "pending_tasks", "scan_runs", "scan_results", "pipeline_runs"];
      for (const t of tables) {
        try {
          const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
          dbStats[t] = row.c;
        } catch { dbStats[t] = "error"; }
      }
      // Last pipeline run
      try {
        const last = db.prepare("SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1").get();
        dbStats.last_pipeline_run = last;
      } catch { /* ignore */ }
      closeDatabase(db);
    } catch (e) {
      dbStats.error = String(e);
    }
  }

  // Optional deps
  const optionalDeps: Record<string, boolean> = {};
  for (const dep of ["@browserbasehq/stagehand", "playwright", "keytar"]) {
    try { await import(dep); optionalDeps[dep] = true; }
    catch { optionalDeps[dep] = false; }
  }

  const report = {
    brokerbane_version: appVersion,
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    os_version: os.release(),
    config_path: configPath,
    config_permissions: configPerms,
    config_status: configContent,
    database: dbStats,
    optional_dependencies: optionalDeps,
  };

  // Apply PII redaction
  const names = [profile.first_name, profile.last_name].filter(Boolean);
  const reportStr = redactPii(JSON.stringify(report, null, 2), {
    names: names.length ? [names.join(" ")] : undefined,
  });

  if (options.json) {
    console.log(reportStr);
  } else {
    const parsed = JSON.parse(reportStr) as typeof report;
    console.log("\n  ━━ BrokerBane Debug Report ━━\n");
    console.log(`  Version:       ${parsed.brokerbane_version}`);
    console.log(`  Node.js:       ${parsed.node_version}`);
    console.log(`  Platform:      ${parsed.platform} ${parsed.arch} (${parsed.os_version})`);
    console.log(`  Config:        ${parsed.config_path} [${parsed.config_permissions}] — ${parsed.config_status}`);
    console.log(`\n  Database rows:`);
    for (const [table, count] of Object.entries(parsed.database)) {
      if (table !== "last_pipeline_run" && table !== "error") {
        console.log(`    ${table}: ${count}`);
      }
    }
    console.log(`\n  Optional deps:`);
    for (const [dep, installed] of Object.entries(parsed.optional_dependencies)) {
      console.log(`    ${dep}: ${installed ? "✓ installed" : "✗ not installed"}`);
    }
    console.log();
  }
}
