import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { PendingTaskRepo } from "../db/repositories/pending-task.repo.js";
import { PipelineRunRepo } from "../db/repositories/pipeline-run.repo.js";

export async function statusCommand(options: {
  format?: string;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({ level: config.logging.level, file: config.logging.file, redactPii: config.logging.redact_pii });
  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    const requestRepo = new RemovalRequestRepo(db);
    const pendingTaskRepo = new PendingTaskRepo(db);
    const pipelineRunRepo = new PipelineRunRepo(db);

    const counts = requestRepo.countByStatus();
    const pendingTasks = pendingTaskRepo.countPending();
    const latestRun = pipelineRunRepo.getLatest();

    if (options.format === "json") {
      console.log(
        JSON.stringify({ counts, pendingTasks, latestRun }, null, 2)
      );
      return;
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  BrokerBane Status");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (latestRun) {
      const runDate = new Date(latestRun.started_at).toLocaleString();
      const runStatus = latestRun.status === "completed" ? "✅ completed" : latestRun.status;
      console.log(`Last run: ${runDate} (${runStatus})`);
      console.log(
        `  Sent: ${latestRun.sent_count}, Failed: ${latestRun.failed_count}, Skipped: ${latestRun.skipped_count}`
      );
      console.log();
    }

    const statusLabels: Record<string, string> = {
      pending:              "Pending",
      scanning:             "Scanning (checking listing)",
      matched:              "Matched (listed on broker)",
      sending:              "Sending",
      sent:                 "✅ Sent",
      awaiting_confirmation:"Awaiting confirmation email",
      confirmed:            "✅ Confirmed",
      completed:            "✅ Completed",
      failed:               "❌ Failed",
      skipped:              "⏩ Skipped (not listed)",
      manual_required:      "⚠️  Manual action required",
    };

    const nonZero = Object.entries(counts).filter(([, n]) => n > 0);
    if (nonZero.length === 0) {
      console.log("  No removal requests yet. Run 'brokerbane remove' to start.");
    } else {
      console.log("Request Status:");
      for (const [status, count] of nonZero) {
        const label = statusLabels[status] ?? status;
        console.log(`  ${label}: ${count}`);
      }
    }

    if (pendingTasks > 0) {
      console.log(`\n⚠️  ${pendingTasks} broker(s) need a manual opt-out form submitted.`);
      console.log("   Run 'brokerbane confirm' to see them with links.");
    }

    console.log();
  } finally {
    closeDatabase(db);
  }
}
