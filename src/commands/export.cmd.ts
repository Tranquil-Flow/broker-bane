import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";

export async function exportCommand(options: {
  format?: string;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    const repo = new RemovalRequestRepo(db);
    const requests = repo.getAll();

    if (options.format === "csv") {
      console.log("broker_id,method,status,attempt_count,created_at,updated_at");
      for (const r of requests) {
        console.log(
          `${r.broker_id},${r.method},${r.status},${r.attempt_count},${r.created_at},${r.updated_at}`
        );
      }
    } else {
      // Default to JSON with PII redacted
      const redacted = requests.map((r) => ({
        broker_id: r.broker_id,
        method: r.method,
        status: r.status,
        attempt_count: r.attempt_count,
        confidence_score: r.confidence_score,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      console.log(JSON.stringify(redacted, null, 2));
    }
  } finally {
    closeDatabase(db);
  }
}
