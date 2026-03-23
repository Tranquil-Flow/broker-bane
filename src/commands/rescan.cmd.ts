import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { RescanScheduleRepo } from "../db/repositories/rescan-schedule.repo.js";

/**
 * Helper: when a removal request reaches 'completed', schedule the next rescan.
 */
export function scheduleRescanAfterCompletion(
  rescanRepo: RescanScheduleRepo,
  brokerId: string,
  intervalDays: number = 90
): void {
  rescanRepo.upsert(brokerId, intervalDays);
}

export async function rescanCommand(options: {
  run?: boolean;
  broker?: string;
  list?: boolean;
  interval?: string;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  const db = createDatabase(config.database.path);
  runMigrations(db);

  try {
    const requestRepo = new RemovalRequestRepo(db);
    const rescanRepo = new RescanScheduleRepo(db);
    const intervalDays = options.interval ? parseInt(options.interval, 10) : 90;

    // --list: show the full rescan schedule
    if (options.list) {
      const all = rescanRepo.getAll();
      if (all.length === 0) {
        console.log("No brokers scheduled for rescan.");
        return;
      }
      console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("  Rescan Schedule");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
      for (const row of all) {
        const next = new Date(row.next_rescan_at).toLocaleString();
        const last = row.last_rescan_at
          ? new Date(row.last_rescan_at).toLocaleString()
          : "never";
        const due = new Date(row.next_rescan_at) <= new Date() ? " ⚠️ DUE" : "";
        console.log(`  ${row.broker_id}${due}`);
        console.log(
          `    Next: ${next}  |  Last: ${last}  |  Interval: ${row.interval_days}d`
        );
      }
      console.log();
      return;
    }

    // --broker <id>: force rescan a specific broker
    if (options.broker) {
      const brokerId = options.broker;
      console.log(`Force-rescanning broker: ${brokerId}`);

      // Reset removal request to pending
      const requests = requestRepo.getByBrokerId(brokerId);
      if (requests.length === 0) {
        console.log(`  No removal requests found for broker '${brokerId}'.`);
      } else {
        for (const req of requests) {
          if (
            req.status === "completed" ||
            req.status === "confirmed" ||
            req.status === "sent" ||
            req.status === "awaiting_confirmation"
          ) {
            requestRepo.updateStatus(req.id, "pending");
          }
        }
        console.log(`  Reset ${requests.length} request(s) to 'pending'.`);
      }

      // Schedule next rescan
      rescanRepo.upsert(brokerId, intervalDays);
      rescanRepo.markRescanned(brokerId);
      console.log(
        `  Next rescan scheduled in ${intervalDays} days.`
      );
      return;
    }

    // --run: re-queue all due brokers
    if (options.run) {
      const due = rescanRepo.getDue();
      if (due.length === 0) {
        console.log("No brokers are currently due for rescan.");
        return;
      }

      console.log(`Re-queuing ${due.length} broker(s) for rescan...`);
      for (const row of due) {
        const requests = requestRepo.getByBrokerId(row.broker_id);
        for (const req of requests) {
          if (
            req.status === "completed" ||
            req.status === "confirmed" ||
            req.status === "sent" ||
            req.status === "awaiting_confirmation"
          ) {
            requestRepo.updateStatus(req.id, "pending");
          }
        }
        rescanRepo.markRescanned(row.broker_id);
        console.log(`  ✅ ${row.broker_id} → re-queued, next rescan in ${row.interval_days}d`);
      }
      return;
    }

    // Default: show which brokers are due
    const due = rescanRepo.getDue();
    if (due.length === 0) {
      console.log("No brokers are currently due for rescan.");
    } else {
      console.log(`\n${due.length} broker(s) due for rescan:\n`);
      for (const row of due) {
        const next = new Date(row.next_rescan_at).toLocaleString();
        console.log(`  ${row.broker_id}  (was due: ${next})`);
      }
      console.log('\nRun with --run to re-queue these brokers.\n');
    }
  } finally {
    closeDatabase(db);
  }
}
