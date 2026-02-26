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

    console.log("\n--- Pipeline Summary ---");
    console.log(`Total brokers: ${summary.totalBrokers}`);
    console.log(`Sent:          ${summary.sent}`);
    console.log(`Failed:        ${summary.failed}`);
    console.log(`Skipped:       ${summary.skipped}`);
    console.log(`Manual:        ${summary.manualRequired}`);
    if (summary.dryRun) {
      console.log("\n(DRY RUN - no emails were actually sent)");
    }
  } finally {
    await orchestrator.cleanup();
  }
}
