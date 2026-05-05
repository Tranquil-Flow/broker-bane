import { loadConfig } from "../config/loader.js";
import { Orchestrator } from "../pipeline/orchestrator.js";
import { logger, reconfigureLogger } from "../util/logger.js";

export async function removeCommand(options: {
  dryRun?: boolean;
  previewToday?: boolean;
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
    if (options.previewToday) {
      const preview = await orchestrator.preview({
        brokerIds,
        methods,
        resume: options.resume,
      });

      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  Today's BrokerBane Batch Preview");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      console.log(`  Broker-facing mailbox: ${preview.brokerFacingEmail}`);
      console.log(`  Identity mode:          ${preview.identityMode} (${preview.privacyLevel})`);
      console.log(`  Daily cap:              ${preview.dailyLimit ?? "unlimited"}`);
      console.log(`  Sent today:             ${preview.sentToday}`);
      console.log(`  Remaining today:        ${preview.remainingToday}`);
      console.log(`  Candidate brokers:      ${preview.totalCandidates}`);
      if (preview.validitySkipped > 0) {
        console.log(`  Recent opt-outs skipped: ${preview.validitySkipped}`);
      }

      if (preview.limitReached) {
        console.log("\n  Daily cap already reached. No brokers would be contacted today.\n");
      } else if (preview.today.length === 0) {
        console.log("\n  No brokers match this preview. No emails, browser sessions, or monitors were started.\n");
      } else {
        console.log("\n  Brokers in today's capped batch:");
        preview.today.forEach((broker, index) => {
          const route = broker.email ? `email: ${broker.email}` : broker.optOutUrl ? `web: ${broker.optOutUrl}` : broker.method;
          console.log(`    ${index + 1}. ${broker.name} (${broker.id}) — ${route}`);
        });
        if (preview.notInTodayCount > 0) {
          console.log(`\n  ${preview.notInTodayCount} additional broker(s) remain for later capped batches.`);
        }
        console.log("\n  Next safe steps:");
        console.log("    1. Re-run this target with --dry-run to render the exact work without external sends.");
        console.log("    2. Remove --dry-run only after you have reviewed the mailbox and broker list.\n");
      }
      return;
    }

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
      console.log("  Remove --dry-run to send real opt-out requests using the same daily cap.\n");
    } else if (summary.limitReached) {
      console.log("\n  Daily privacy-safe send cap reached.");
      console.log("  BrokerBane stopped before blasting the mailbox; run 'brokerbane remove --resume' tomorrow to continue.\n");
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
