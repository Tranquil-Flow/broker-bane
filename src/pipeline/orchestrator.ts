import type { AppConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { REQUEST_STATUS } from "../types/pipeline.js";
import type { RequestStatus } from "../types/pipeline.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import { BrokerStore } from "../data/broker-store.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { BrokerResponseRepo } from "../db/repositories/broker-response.repo.js";
import { PendingTaskRepo } from "../db/repositories/pending-task.repo.js";
import { EmailLogRepo } from "../db/repositories/email-log.repo.js";
import { CircuitBreakerRepo } from "../db/repositories/circuit-breaker.repo.js";
import { PipelineRunRepo } from "../db/repositories/pipeline-run.repo.js";
import { EmailSender } from "../email/sender.js";
import { buildTemplateVariables, renderTemplate } from "../email/template-engine.js";
import { CircuitBreaker } from "./circuit-breaker.js";
import { transition } from "./state-machine.js";
import { withRetry, configToRetryOptions } from "./retry.js";
import { scheduleBrokers } from "./scheduler.js";
import { randomDelay } from "../util/delay.js";
import { logger } from "../util/logger.js";

import type Database from "better-sqlite3";

export interface OrchestratorOptions {
  dryRun?: boolean;
  brokerIds?: string[];
  methods?: Array<"email" | "web" | "all">;
  resume?: boolean;
}

export interface PipelineSummary {
  totalBrokers: number;
  sent: number;
  failed: number;
  skipped: number;
  manualRequired: number;
  dryRun: boolean;
}

export class Orchestrator {
  private db: InstanceType<typeof Database> | null = null;
  private emailSender: EmailSender | null = null;
  private aborted = false;

  constructor(private readonly config: AppConfig) {}

  async run(options: OrchestratorOptions = {}): Promise<PipelineSummary> {
    const dryRun = options.dryRun ?? this.config.options.dry_run;

    // Initialize database
    this.db = createDatabase(this.config.database.path);
    runMigrations(this.db);

    const requestRepo = new RemovalRequestRepo(this.db);
    const emailLogRepo = new EmailLogRepo(this.db);
    const circuitBreakerRepo = new CircuitBreakerRepo(this.db);
    const pipelineRunRepo = new PipelineRunRepo(this.db);
    const pendingTaskRepo = new PendingTaskRepo(this.db);

    const circuitBreaker = new CircuitBreaker(
      circuitBreakerRepo,
      this.config.circuit_breaker
    );

    // Load and filter brokers
    const brokerDb = loadBrokerDatabase();
    const store = new BrokerStore(brokerDb.brokers);

    let brokers: readonly Broker[];
    if (options.brokerIds?.length) {
      brokers = options.brokerIds
        .map((id) => store.getById(id))
        .filter((b): b is Broker => b !== undefined);
    } else {
      brokers = store.filter({
        regions: this.config.options.regions as any,
        tiers: this.config.options.tiers,
        excludeIds: this.config.options.excluded_brokers,
      });
    }

    // Filter by method if specified
    if (options.methods?.length && !options.methods.includes("all")) {
      const methodFilter = options.methods.includes("email") ? "email" : "web_form";
      brokers = brokers.filter(
        (b) => b.removal_method === methodFilter || b.removal_method === "hybrid"
      );
    }

    // Schedule broker order
    const scheduled = scheduleBrokers(brokers);

    // Filter out completed brokers if resuming
    let toProcess = scheduled;
    if (options.resume) {
      const completedIds = new Set(
        requestRepo
          .getByStatus(REQUEST_STATUS.completed)
          .map((r) => r.broker_id)
      );
      toProcess = scheduled.filter((b) => !completedIds.has(b.id));
      if (toProcess.length < scheduled.length) {
        logger.info(
          { skipped: scheduled.length - toProcess.length },
          "Resuming: skipping completed brokers"
        );
      }
    }

    // Create pipeline run
    const pipelineRun = pipelineRunRepo.create(toProcess.length);

    // Initialize email sender
    this.emailSender = new EmailSender(this.config.email, dryRun);

    const summary: PipelineSummary = {
      totalBrokers: toProcess.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      manualRequired: 0,
      dryRun,
    };

    logger.info(
      { totalBrokers: toProcess.length, dryRun },
      "Starting removal pipeline"
    );

    // Process each broker
    for (const broker of toProcess) {
      if (this.aborted) {
        logger.info("Pipeline aborted by user");
        break;
      }

      try {
        // Check circuit breaker
        if (circuitBreaker.isOpen(broker.id)) {
          logger.info({ brokerId: broker.id }, "Skipping: circuit breaker open");
          summary.skipped++;
          pipelineRunRepo.incrementSkipped(pipelineRun.id);
          continue;
        }

        // Create removal request
        const request = requestRepo.create({
          brokerId: broker.id,
          method: broker.removal_method,
          templateUsed: this.config.options.template,
          emailSentTo: broker.email,
        });

        // Process based on removal method
        if (
          broker.removal_method === "email" ||
          broker.removal_method === "hybrid"
        ) {
          await this.processEmailRemoval(
            broker,
            request.id,
            requestRepo,
            emailLogRepo,
            dryRun
          );
        }

        if (
          broker.removal_method === "web_form" ||
          broker.removal_method === "hybrid"
        ) {
          // Web form removal requires browser - queue as pending task if browser not available
          pendingTaskRepo.create({
            requestId: request.id,
            taskType: "manual_form",
            description: `Submit opt-out form at ${broker.opt_out_url ?? broker.domain}`,
            url: broker.opt_out_url,
          });
          summary.manualRequired++;
        }

        // Mark success for email-only brokers
        if (broker.removal_method === "email") {
          requestRepo.updateStatus(request.id, REQUEST_STATUS.sent);
          circuitBreaker.recordSuccess(broker.id);
        }

        summary.sent++;
        pipelineRunRepo.incrementSent(pipelineRun.id);

        // Random delay between brokers
        await randomDelay(
          this.config.options.delay_min_ms,
          this.config.options.delay_max_ms
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ brokerId: broker.id, err: message }, "Broker processing failed");
        circuitBreaker.recordFailure(broker.id);
        summary.failed++;
        pipelineRunRepo.incrementFailed(pipelineRun.id);
      }
    }

    // Finish pipeline run
    pipelineRunRepo.finish(
      pipelineRun.id,
      this.aborted ? "interrupted" : "completed",
      { sent: summary.sent, failed: summary.failed, skipped: summary.skipped }
    );

    // Cleanup
    await this.emailSender?.close();
    this.emailSender = null;

    logger.info(summary, "Pipeline completed");
    return summary;
  }

  private async processEmailRemoval(
    broker: Broker,
    requestId: number,
    requestRepo: RemovalRequestRepo,
    emailLogRepo: EmailLogRepo,
    dryRun: boolean
  ): Promise<void> {
    if (!broker.email) {
      logger.warn({ brokerId: broker.id }, "No email address for broker, skipping email");
      return;
    }

    const variables = buildTemplateVariables(this.config.profile, broker.name);
    const rendered = renderTemplate(this.config.options.template, variables);

    const retryOptions = configToRetryOptions(this.config.retry);

    await withRetry(
      async () => {
        requestRepo.updateStatus(requestId, REQUEST_STATUS.sending);
        requestRepo.incrementAttempt(requestId);

        const result = await this.emailSender!.send({
          from: this.config.email.auth.user,
          to: broker.email!,
          subject: rendered.subject,
          text: rendered.body,
        });

        emailLogRepo.create({
          requestId,
          direction: "outbound",
          messageId: result.messageId,
          fromAddr: this.config.email.auth.user,
          toAddr: broker.email!,
          subject: rendered.subject,
          status: result.rejected.length > 0 ? "rejected" : "sent",
        });
      },
      retryOptions,
      `email to ${broker.name}`
    );
  }

  abort(): void {
    this.aborted = true;
  }

  async cleanup(): Promise<void> {
    await this.emailSender?.close();
    if (this.db) {
      closeDatabase(this.db);
      this.db = null;
    }
  }
}
