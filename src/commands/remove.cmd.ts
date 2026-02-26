import { loadConfig } from "../config/loader.js";
import { Orchestrator } from "../pipeline/orchestrator.js";
import { logger, reconfigureLogger } from "../util/logger.js";

export async function removeCommand(options: {
  dryRun?: boolean;
  brokers?: string;
  method?: string;
  resume?: boolean;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({ level: config.logging.level, file: config.logging.file, redactPii: config.logging.redact_pii });
  const orchestrator = new Orchestrator(config);

  // Handle SIGINT
  process.on("SIGINT", () => {
    console.log("\nInterrupted. Finishing current broker...");
    orchestrator.abort();
  });

  const brokerIds = options.brokers?.split(",").map((s) => s.trim());
  const methods = options.method
    ? [options.method as "email" | "web" | "all"]
    : undefined;

  try {
    const summary = await orchestrator.run({
      dryRun: options.dryRun,
      brokerIds,
      methods,
      resume: options.resume,
    });

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(summary.dryRun ? "  Dry Run Complete" : "  Removal Pipeline Complete");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log(`  Brokers processed:  ${summary.totalBrokers}`);
    console.log(`  ✅ Requests sent:   ${summary.sent}`);
    if (summary.failed > 0)   console.log(`  ❌ Failed:          ${summary.failed}`);
    if (summary.skipped > 0)  console.log(`  ⏩ Skipped:         ${summary.skipped}  (not listed on these brokers)`);
    if (summary.manualRequired > 0) {
      console.log(`  ⚠️  Manual action:   ${summary.manualRequired}  (web form submission required)`);
    }

    if (summary.dryRun) {
      console.log("\n  No emails were actually sent (dry run mode).");
      console.log("  Remove --dry-run to send real opt-out requests.\n");
    } else if (summary.manualRequired > 0) {
      console.log(`\n  ${summary.manualRequired} broker(s) require you to submit an opt-out form manually.`);
      console.log("  Run 'brokerbane confirm' to see the list with links.\n");
    } else {
      console.log("\n  All done! Run 'brokerbane status' to check progress over time.\n");
    }
  } finally {
    await orchestrator.cleanup();
  }
}
