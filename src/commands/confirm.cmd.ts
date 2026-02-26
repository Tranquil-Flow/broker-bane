import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { PendingTaskRepo } from "../db/repositories/pending-task.repo.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { REQUEST_STATUS } from "../types/pipeline.js";

export async function confirmCommand(options: {
  all?: boolean;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    const pendingTaskRepo = new PendingTaskRepo(db);
    const requestRepo = new RemovalRequestRepo(db);

    const tasks = pendingTaskRepo.getPending();

    if (tasks.length === 0) {
      console.log("\nNo pending tasks.\n");
      return;
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  ${tasks.length} broker(s) need a manual opt-out form`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log("  These brokers don't accept opt-out by email — you need to");
    console.log("  visit their website and submit a removal form yourself.\n");

    let i = 1;
    for (const task of tasks) {
      console.log(`  ${i}. ${task.description}`);
      if (task.url) console.log(`     → ${task.url}`);
      console.log();
      i++;
    }

    if (options.all) {
      for (const task of tasks) {
        pendingTaskRepo.markCompleted(task.id);
        requestRepo.updateStatus(task.request_id, REQUEST_STATUS.completed);
      }
      console.log(`✅ Marked ${tasks.length} task(s) as completed.\n`);
    } else {
      console.log("  After submitting each form, run:");
      console.log("    brokerbane confirm --all   (marks all as done)");
      console.log();
    }
  } finally {
    closeDatabase(db);
  }
}
