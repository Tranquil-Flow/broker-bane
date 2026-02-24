import { loadConfig } from "../config/loader.js";
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

    console.log("\n--- BrokerBane Status ---\n");

    if (latestRun) {
      console.log(`Last run: ${latestRun.started_at} (${latestRun.status})`);
      console.log(
        `  Sent: ${latestRun.sent_count}, Failed: ${latestRun.failed_count}, Skipped: ${latestRun.skipped_count}`
      );
      console.log();
    }

    console.log("Request Status:");
    for (const [status, count] of Object.entries(counts)) {
      console.log(`  ${status}: ${count}`);
    }

    if (pendingTasks > 0) {
      console.log(`\nPending manual tasks: ${pendingTasks}`);
      console.log("  Run 'brokerbane confirm' to handle them");
    }

    console.log();
  } finally {
    closeDatabase(db);
  }
}
