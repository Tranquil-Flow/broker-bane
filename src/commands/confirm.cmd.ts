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

    console.log(`\n${tasks.length} pending task(s):\n`);

    for (const task of tasks) {
      console.log(`  [${task.id}] ${task.task_type}: ${task.description}`);
      if (task.url) console.log(`      URL: ${task.url}`);
    }

    if (options.all) {
      for (const task of tasks) {
        pendingTaskRepo.markCompleted(task.id);
        requestRepo.updateStatus(task.request_id, REQUEST_STATUS.completed);
      }
      console.log(`\nMarked ${tasks.length} task(s) as completed.`);
    } else {
      console.log(
        "\nUse --all to mark all as completed, or handle individually."
      );
    }

    console.log();
  } finally {
    closeDatabase(db);
  }
}
