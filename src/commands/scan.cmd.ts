import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { Scanner } from "../pipeline/scanner.js";

export async function scanCommand(options: {
  dryRun?: boolean;
  autoRemove?: boolean;
  category?: string;
  brokers?: string;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({
    level: config.logging.level,
    file: config.logging.file,
    redactPii: config.logging.redact_pii,
  });

  const scanner = new Scanner(config);

  // Graceful abort on Ctrl+C
  const onSigInt = () => {
    console.log("\n  Finishing current broker scan...");
    scanner.abort();
  };
  process.on("SIGINT", onSigInt);

  try {
    const summary = await scanner.scan({
      dryRun: options.dryRun,
      autoRemove: options.autoRemove,
      category: options.category,
      brokerIds: options.brokers?.split(",").map((s) => s.trim()),
    });

    console.log();
    if (summary.dryRun) {
      console.log(`  [DRY RUN] Would scan ${summary.totalScanned} brokers`);
      console.log(`  Remove --dry-run to execute the scan.`);
    } else {
      console.log(`  Scan complete:`);
      console.log(`    Scanned:  ${summary.totalScanned} brokers`);
      console.log(`    Found:    ${summary.found} listings`);
      console.log(`    Clean:    ${summary.notFound} brokers`);
      console.log(`    Errors:   ${summary.errors}`);

      if (summary.found > 0) {
        console.log();
        console.log(`  Brokers where your profile was found:`);
        for (const id of summary.foundBrokerIds) {
          console.log(`    - ${id}`);
        }
      }

      if (summary.autoRemoveTriggered > 0) {
        console.log();
        console.log(`  Auto-removal triggered for ${summary.autoRemoveTriggered} brokers.`);
        console.log(`  Run 'brokerbane status' to track progress.`);
      } else if (summary.found > 0 && !options.autoRemove) {
        console.log();
        console.log(`  To auto-remove, run: brokerbane scan --auto-remove`);
        console.log(`  Or target specific brokers: brokerbane remove -b ${summary.foundBrokerIds.join(",")}`);
      }
    }
    console.log();
  } finally {
    process.removeListener("SIGINT", onSigInt);
    scanner.cleanup();
  }
}
