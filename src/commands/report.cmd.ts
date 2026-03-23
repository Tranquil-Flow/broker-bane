import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";

export interface ReportSummary {
  contacted: number;
  confirmed_removed: number;
  pending: number;
  stale: number;
  failed: number;
  counts: Record<string, number>;
  generated_at: string;
}

export interface BrokerHistory {
  broker_id: string;
  attempts: Array<{
    id: number;
    status: string;
    attempt_count: number;
    updated_at: string;
    created_at: string;
  }>;
}

export function buildReportSummary(
  requestRepo: RemovalRequestRepo,
  staleDays: number = 30
): ReportSummary {
  const counts = requestRepo.countByStatus();
  const staleRequests = requestRepo.getStale(staleDays);

  const contacted =
    (counts["sent"] ?? 0) +
    (counts["awaiting_confirmation"] ?? 0) +
    (counts["confirmed"] ?? 0) +
    (counts["completed"] ?? 0) +
    (counts["failed"] ?? 0);

  const confirmed_removed =
    (counts["confirmed"] ?? 0) + (counts["completed"] ?? 0);

  const pending =
    (counts["pending"] ?? 0) +
    (counts["scanning"] ?? 0) +
    (counts["matched"] ?? 0) +
    (counts["sending"] ?? 0);

  return {
    contacted,
    confirmed_removed,
    pending,
    stale: staleRequests.length,
    failed: counts["failed"] ?? 0,
    counts,
    generated_at: new Date().toISOString(),
  };
}

export function buildBrokerHistory(
  requestRepo: RemovalRequestRepo
): BrokerHistory[] {
  const all = requestRepo.getAll();
  const byBroker: Record<string, BrokerHistory> = {};

  for (const row of all) {
    if (!byBroker[row.broker_id]) {
      byBroker[row.broker_id] = { broker_id: row.broker_id, attempts: [] };
    }
    byBroker[row.broker_id].attempts.push({
      id: row.id,
      status: row.status,
      attempt_count: row.attempt_count,
      updated_at: row.updated_at,
      created_at: row.created_at,
    });
  }

  return Object.values(byBroker).sort((a, b) =>
    a.broker_id.localeCompare(b.broker_id)
  );
}

export async function reportCommand(options: {
  format?: string;
  verbose?: boolean;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    const requestRepo = new RemovalRequestRepo(db);
    const summary = buildReportSummary(requestRepo);

    if (options.format === "json") {
      const output: { summary: ReportSummary; history?: BrokerHistory[] } = {
        summary,
      };
      if (options.verbose) {
        output.history = buildBrokerHistory(requestRepo);
      }
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Plain text output
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("  BrokerBane Report");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Generated: ${new Date(summary.generated_at).toLocaleString()}\n`);

    console.log("Summary:");
    console.log(`  Total contacted:   ${summary.contacted}`);
    console.log(`  Confirmed removed: ${summary.confirmed_removed}`);
    console.log(`  Pending:           ${summary.pending}`);
    console.log(`  Stale (>30 days):  ${summary.stale}`);
    console.log(`  Failed:            ${summary.failed}`);

    const nonZero = Object.entries(summary.counts).filter(([, n]) => n > 0);
    if (nonZero.length > 0) {
      console.log("\nFull breakdown:");
      for (const [status, count] of nonZero) {
        console.log(`  ${status}: ${count}`);
      }
    }

    if (options.verbose) {
      const history = buildBrokerHistory(requestRepo);
      if (history.length === 0) {
        console.log("\nNo broker history found.");
      } else {
        console.log("\nPer-Broker History:");
        for (const broker of history) {
          console.log(`\n  ${broker.broker_id}:`);
          for (const attempt of broker.attempts) {
            const ts = new Date(attempt.updated_at).toLocaleString();
            console.log(
              `    [${ts}] status=${attempt.status} attempts=${attempt.attempt_count}`
            );
          }
        }
      }
    }

    console.log();
  } finally {
    closeDatabase(db);
  }
}
