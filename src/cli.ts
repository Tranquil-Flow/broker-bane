#!/usr/bin/env node
import { Command } from "commander";
import { initCommand } from "./commands/init.cmd.js";
import { removeCommand } from "./commands/remove.cmd.js";
import { statusCommand } from "./commands/status.cmd.js";
import { resumeCommand } from "./commands/resume.cmd.js";
import { listBrokersCommand } from "./commands/list-brokers.cmd.js";
import { confirmCommand } from "./commands/confirm.cmd.js";
import { exportCommand } from "./commands/export.cmd.js";
import { testConfigCommand } from "./commands/test-config.cmd.js";
import { menuCommand } from "./commands/menu.cmd.js";
import { scheduleCommand } from "./commands/schedule.cmd.js";
import { dashboardCommand } from "./commands/dashboard.cmd.js";
import { scanCommand } from "./commands/scan.cmd.js";
import { verifyEvidenceCommand } from "./commands/verify-evidence.cmd.js";
import { generatePlaybookCommand } from "./commands/generate-playbook.cmd.js";
import { backupCommand, backupInfoCommand } from "./commands/backup.cmd.js";
import { importPortableCommand } from "./commands/import-portable.cmd.js";
import { settingsShowCommand, settingsEditCommand } from "./commands/settings.cmd.js";
import { debugReportCommand } from "./commands/debug-report.cmd.js";

const program = new Command();

program
  .name("brokerbane")
  .description(
    "Free, open-source CLI tool for automated GDPR/CCPA data broker removal requests"
  )
  .version("0.1.0");

program
  .command("init")
  .description("Interactive setup wizard")
  .action(async () => {
    await initCommand();
  });

program
  .command("remove")
  .description("Execute removal pipeline")
  .option("-d, --dry-run", "Preview what would be sent without actually sending")
  .option("-b, --brokers <ids>", "Comma-separated broker IDs to target")
  .option("-m, --method <method>", "Filter by method: email, web, all", "all")
  .option("-r, --resume", "Resume an interrupted pipeline run")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await removeCommand(opts);
  });

program
  .command("status")
  .description("Show pipeline status")
  .option("-f, --format <format>", "Output format: table, json", "table")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await statusCommand(opts);
  });

program
  .command("resume")
  .description("Resume interrupted pipeline")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await resumeCommand(opts);
  });

program
  .command("list-brokers")
  .description("List and filter available brokers")
  .option("-r, --region <region>", "Filter by region (us, eu, gb, ch, ca, br, mx, ar, au, nz, jp, kr, in, sg, hk, za, il, global)")
  .option("--country <code>", "Filter by ISO country code (e.g., fr, de, au)")
  .option("-t, --tier <tier>", "Filter by tier (1, 2, 3)")
  .option("-m, --method <method>", "Filter by method (email, web_form, hybrid)")
  .option("-s, --search <query>", "Search by name or domain")
  .option("-f, --format <format>", "Output format: table, json", "table")
  .action(async (opts) => {
    await listBrokersCommand(opts);
  });

program
  .command("confirm")
  .description("Handle pending manual confirmation tasks")
  .option("-a, --all", "Mark all pending tasks as completed")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await confirmCommand(opts);
  });

program
  .command("export")
  .description("Export results to CSV or JSON")
  .option("-f, --format <format>", "Output format: csv, json", "json")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await exportCommand(opts);
  });

program
  .command("test-config")
  .description("Validate configuration and test connections")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await testConfigCommand(opts);
  });

program
  .command("schedule")
  .description("Manage OS-level scheduled removal runs")
  .argument("<action>", "install, uninstall, or status")
  .option("-c, --config <path>", "Override config file path")
  .option("-i, --interval <days>", "Days between runs (default: 90)")
  .action(async (action: string, opts: { config?: string; interval?: string }) => {
    await scheduleCommand(action, opts);
  });

program
  .command("dashboard")
  .description("Launch web dashboard on localhost")
  .option("-p, --port <port>", "Port number (default: 3847)")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await dashboardCommand({
      port: opts.port ? Number(opts.port) : undefined,
      config: opts.config,
    });
  });

program
  .command("scan")
  .description("Scan people search brokers for your profile")
  .option("-d, --dry-run", "Preview which brokers would be scanned")
  .option("-a, --auto-remove", "Automatically trigger removal for found listings")
  .option("--category <category>", "Broker category to scan (default: people_search)")
  .option("--country <code>", "Filter by ISO country code (e.g., fr, de, au)")
  .option("-b, --brokers <ids>", "Comma-separated broker IDs to scan")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await scanCommand(opts);
  });

program
  .command("verify-evidence")
  .description("Verify the cryptographic evidence chain integrity")
  .option("--broker <id>", "Verify chain for a specific broker and show text diff")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await verifyEvidenceCommand(opts);
  });

program
  .command("generate-playbook")
  .description("Generate playbook YAML for broker opt-out forms using AI")
  .option("-b, --broker <id>", "Generate playbook for a specific broker")
  .option("--all-missing", "Generate for all brokers with opt_out_url but no playbook")
  .option("-d, --dry-run", "Show which brokers would be targeted without generating")
  .option("-c, --config <path>", "Override config file path")
  .action(async (opts) => {
    await generatePlaybookCommand(opts);
  });

const backupCmd = program
  .command("backup")
  .description("Create an encrypted portable backup of your data");

backupCmd
  .command("create")
  .description("Create a new backup")
  .option("-o, --output <path>", "Output file path")
  .option("--exclude <sections>", "Comma-separated sections to exclude (email_log, pipeline_runs)")
  .option("-c, --config <path>", "Config file path")
  .action(async (opts) => {
    await backupCommand({
      output: opts.output,
      exclude: opts.exclude?.split(","),
      config: opts.config,
    });
  });

backupCmd
  .command("info <file>")
  .description("Show backup file contents without decrypting")
  .action(async (file) => {
    await backupInfoCommand(file);
  });

program
  .command("import-backup <file>")
  .description("Import a .brokerbane backup file")
  .option("--dry-run", "Preview what would be imported without applying")
  .option("-c, --config <path>", "Config file path")
  .action(async (file, opts) => {
    await importPortableCommand(file, opts);
  });

program
  .command("debug-report")
  .description("Generate a redacted diagnostic report for troubleshooting")
  .option("--json", "Output as JSON")
  .option("-c, --config <path>", "Config file path")
  .action(async (opts) => {
    await debugReportCommand(opts);
  });

const settingsCmd = program
  .command("settings")
  .description("View and edit your BrokerBane configuration");

settingsCmd
  .command("show")
  .description("Show current settings")
  .option("-c, --config <path>", "Config file path")
  .action(async (opts) => {
    await settingsShowCommand(opts);
  });

settingsCmd
  .command("edit")
  .description("Interactively edit settings")
  .option("-c, --config <path>", "Config file path")
  .action(async (opts) => {
    await settingsEditCommand(opts);
  });

// Global error handler
program.hook("preAction", () => {
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
});

// If no subcommand given, launch interactive menu
if (process.argv.length <= 2) {
  menuCommand().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  program.parse();
}
