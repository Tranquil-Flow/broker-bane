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
  .option("-r, --region <region>", "Filter by region (us, eu, global)")
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

// Global error handler
program.hook("preAction", () => {
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
});

program.parse();
