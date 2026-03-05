import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { EvidenceChainRepo } from "../db/repositories/evidence-chain.repo.js";
import { EvidenceChainService } from "../pipeline/evidence-chain.js";

export async function verifyEvidenceCommand(options: {
  broker?: string;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({
    level: config.logging.level,
    file: config.logging.file,
    redactPii: config.logging.redact_pii,
  });

  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    const repo = new EvidenceChainRepo(db);
    const service = new EvidenceChainService(repo);

    const result = service.verifyChain(options.broker);

    console.log();
    if (result.totalEntries === 0) {
      console.log("  No evidence chain entries found.");
      console.log("  Run 'brokerbane scan' or 'brokerbane remove' to start building the evidence chain.");
    } else if (result.valid) {
      console.log(`  Evidence chain VALID`);
      console.log(`  Total entries: ${result.totalEntries}`);
      console.log(`  All hashes verified. No tampering detected.`);
    } else {
      console.log(`  Evidence chain BROKEN`);
      console.log(`  Total entries: ${result.totalEntries}`);
      console.log(`  Break detected at entry: ${result.brokenAt}`);
      console.log(`  Error: ${result.error}`);
      console.log();
      console.log(`  Entries before the break point are still valid and trustworthy.`);
      console.log(`  To repair the chain, the system can start a new segment.`);
    }
    console.log();

    // Show text diff if broker specified
    if (options.broker) {
      const diff = service.getTextDiff(options.broker);
      if (diff) {
        console.log(`  Text diff for ${options.broker}:`);
        if (diff.removedLines.length > 0) {
          console.log(`  Removed (personal data no longer visible):`);
          for (const line of diff.removedLines.slice(0, 20)) {
            console.log(`    - ${line}`);
          }
        }
        if (diff.addedLines.length > 0) {
          console.log(`  Added:`);
          for (const line of diff.addedLines.slice(0, 10)) {
            console.log(`    + ${line}`);
          }
        }
        if (diff.removedLines.length === 0 && diff.addedLines.length === 0) {
          console.log(`    No text changes detected between scans.`);
        }
        console.log();
      }
    }
  } finally {
    closeDatabase(db);
  }
}
