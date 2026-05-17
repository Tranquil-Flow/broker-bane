import { loadConfig } from "../config/loader.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { RetryQueueRepo } from "../db/repositories/retry-queue.repo.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { BrokerResponseRepo } from "../db/repositories/broker-response.repo.js";
import { EmailLogRepo } from "../db/repositories/email-log.repo.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import { ConfirmationWorker } from "../inbox/confirmation-worker.js";
import { AutopilotRunner, type AutopilotCycleResult } from "../pipeline/autopilot.js";
import { Orchestrator } from "../pipeline/orchestrator.js";
import { RetryQueue } from "../pipeline/retry-queue.js";
import { RetryWorker } from "../pipeline/retry-worker.js";
import { createRetryHandlers } from "../pipeline/retry-handlers.js";
import { isEmailRetryPayloadV1 } from "../pipeline/retry-payloads.js";
import { configToRetryOptions } from "../pipeline/retry.js";
import { REQUEST_STATUS } from "../types/pipeline.js";
import { logger } from "../util/logger.js";
import { getBrokerIdentityId, getBrokerIdentityImap } from "../types/identity.js";
import { reconfigureLogger } from "../util/logger.js";
import { formatAutopilotStatus } from "./autopilot-status-format.js";

export interface AutopilotCommandOptions {
  config?: string;
  brokers?: string;
  method?: string;
  once?: boolean;
  intervalMs?: string;
  testMode?: boolean;
}

export async function autopilotCommand(action: string, options: AutopilotCommandOptions): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({ level: config.logging.level, file: config.logging.file, redactPii: config.logging.redact_pii });

  if (action === "status") {
    await autopilotStatus(config.database.path, async () => {
      const orchestrator = new Orchestrator(config);
      try {
        return await orchestrator.preview({
          brokerIds: parseBrokerIds(options.brokers),
          methods: parseMethods(options.method),
          resume: true,
        });
      } finally {
        await orchestrator.cleanup();
      }
    });
    return;
  }

  if (action === "stop") {
    console.log("\nBrokerBane autopilot currently runs as a foreground local worker.");
    console.log("Stop the active worker with Ctrl-C in the terminal where `brokerbane autopilot start` is running.\n");
    return;
  }

  if (action !== "start") {
    throw new Error(`Unknown autopilot action: ${action}. Use status, start, or stop.`);
  }

  const workerDb = createDatabase(config.database.path);
  runMigrations(workerDb);
  const brokerDatabase = loadBrokerDatabase();
  const workerRequestRepo = new RemovalRequestRepo(workerDb);
  const workerEmailLogRepo = new EmailLogRepo(workerDb);
  const workerRetryRepo = new RetryQueueRepo(workerDb);
  const retryQueue = new RetryQueue(workerRetryRepo, configToRetryOptions(config.retry));
  const orchestrator = new Orchestrator(config, { retryQueue, db: workerDb });
  const retryBundle = createRetryHandlers({
    config,
    brokers: brokerDatabase.brokers,
    requestRepo: workerRequestRepo,
    emailLogRepo: workerEmailLogRepo,
    dryRun: options.testMode ?? false,
  });
  const retryWorker = new RetryWorker({
    queue: retryQueue,
    emailLogRepo: workerEmailLogRepo,
    identityId: getBrokerIdentityId(config),
    dailyLimit: config.options.daily_limit,
    handlers: retryBundle.handlers,
    onTaskExhausted: ({ row, payload, error }) => {
      const message = error instanceof Error ? error.message : String(error);
      const reason = `retry queue exhausted after ${row.attempt_count} attempts: ${message}`;
      if (isEmailRetryPayloadV1(payload)) {
        workerRequestRepo.updateStatus(payload.requestId, REQUEST_STATUS.failed, reason);
      }
      logger.warn(
        { brokerId: row.broker_id, taskType: row.task_type, attempts: row.attempt_count },
        "retry task exhausted — marked request as permanently failed",
      );
    },
  });
  const confirmationWorker = options.testMode
    ? undefined
    : new ConfirmationWorker({
        inbox: getBrokerIdentityImap(config),
        identityId: getBrokerIdentityId(config),
        brokers: brokerDatabase.brokers,
        requestRepo: workerRequestRepo,
        responseRepo: new BrokerResponseRepo(workerDb),
      });
  const runner = new AutopilotRunner({
    orchestrator,
    retryWorker,
    confirmationWorker,
    testMode: options.testMode ?? false,
    sleepMs: options.intervalMs ? Number(options.intervalMs) : undefined,
  });

  const stop = () => {
    console.log("\nAutopilot stop requested. Finishing the current safe boundary...");
    runner.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(options.testMode ? "  BrokerBane Autopilot Test Mode" : "  BrokerBane Autopilot");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
    console.log("Autopilot previews before every send cycle and respects the daily cap.");
    if (options.testMode) {
      console.log("Test mode is active: pipeline cycles are forced to dry-run; no broker emails are sent.");
    }
    console.log(options.once ? "Running one cycle.\n" : "Running foreground watch loop. Press Ctrl-C to stop.\n");

    await runner.runLoop({
      brokerIds: parseBrokerIds(options.brokers),
      methods: parseMethods(options.method),
      maxCycles: options.once ? 1 : undefined,
      onCycle: printCycleResult,
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await retryBundle.close();
    closeDatabase(workerDb);
  }
}

async function autopilotStatus(
  dbPath: string,
  loadPreview: () => Promise<Awaited<ReturnType<Orchestrator["preview"]>>>
): Promise<void> {
  const preview = await loadPreview();
  const db = createDatabase(dbPath);
  runMigrations(db);
  try {
    const retryRepo = new RetryQueueRepo(db);
    console.log(
      formatAutopilotStatus({
        preview,
        retryPending: retryRepo.countPending(),
        retryReady: retryRepo.countReady(),
      }),
    );
  } finally {
    closeDatabase(db);
  }
}

function printCycleResult(result: AutopilotCycleResult): void {
  const skipped = result.skippedRunReason ? `, skipped=${result.skippedRunReason}` : "";
  const sent = result.pipeline ? `, sent=${result.pipeline.sent}, failed=${result.pipeline.failed}` : "";
  const retries = result.retry ? `, retries_processed=${result.retry.processed}` : "";
  console.log(
    `[${new Date().toISOString()}] preview=${result.preview.today.length}, remaining=${result.preview.remainingToday}${sent}${retries}${skipped}`
  );
}

function parseBrokerIds(value?: string): string[] | undefined {
  return value?.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseMethods(value?: string): Array<"email" | "web" | "all"> | undefined {
  return value ? [value as "email" | "web" | "all"] : undefined;
}
