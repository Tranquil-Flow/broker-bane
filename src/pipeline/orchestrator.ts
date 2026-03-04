import type { AppConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { REQUEST_STATUS } from "../types/pipeline.js";
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
import { withRetry, configToRetryOptions } from "./retry.js";
import { scheduleBrokers } from "./scheduler.js";
import { randomDelay } from "../util/delay.js";
import { logger } from "../util/logger.js";
import { EmailError } from "../util/errors.js";
import { loadAllPlaybooks } from "../playbook/loader.js";
import { PlaybookExecutor } from "../playbook/executor.js";
import type { Playbook } from "../playbook/schema.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

export interface OrchestratorInit {
  playbookDir?: string;
}

export class Orchestrator {
  private db: InstanceType<typeof Database> | null = null;
  private emailSender: EmailSender | null = null;
  private aborted = false;
  private readonly playbooks: Map<string, Playbook>;

  constructor(
    private readonly config: AppConfig,
    init: OrchestratorInit = {}
  ) {
    const defaultDir = join(dirname(fileURLToPath(import.meta.url)), "../../data/playbooks");
    this.playbooks = loadAllPlaybooks(init.playbookDir ?? defaultDir);
  }

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
    const brokerResponseRepo = new BrokerResponseRepo(this.db);

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

    // Skip brokers whose opt-out is still within their validity window.
    // This check is bypassed in resume mode, where the intent is to continue
    // a previously interrupted pipeline run rather than start a new one.
    let validitySkippedCount = 0;
    if (!options.resume) {
      const validityFiltered: Broker[] = [];
      for (const broker of toProcess) {
        const lastSentAt = requestRepo.getLastSentAt(broker.id);
        if (lastSentAt) {
          const validityMs = broker.opt_out_validity_days * 24 * 60 * 60 * 1000;
          const expiresAt = new Date(lastSentAt).getTime() + validityMs;
          if (Date.now() < expiresAt) {
            validitySkippedCount++;
            continue; // skip: opt-out still valid
          }
        }
        validityFiltered.push(broker);
      }
      if (validitySkippedCount > 0) {
        logger.info({ count: validitySkippedCount }, "Skipping brokers with valid recent opt-out");
      }
      toProcess = validityFiltered;
    }

    // Create pipeline run
    const pipelineRun = pipelineRunRepo.create(toProcess.length);

    // Initialize email sender
    this.emailSender = new EmailSender(this.config.email, dryRun);

    // Try to initialize browser if api_key is configured
    let browser: import("../browser/session.js").StagehandInstance | null = null;
    if (this.config.browser.api_key) {
      try {
        const { initBrowser } = await import("../browser/session.js");
        browser = await initBrowser(this.config.browser);
        logger.info("Browser automation enabled");
      } catch (err) {
        logger.warn({ err }, "Browser initialization failed, web form removals will be queued as manual tasks");
      }
    }

    // Start inbox monitor in background if configured
    let inboxMonitor: import("../inbox/monitor.js").InboxMonitor | null = null;
    if (this.config.inbox) {
      try {
        const { InboxMonitor } = await import("../inbox/monitor.js");
        inboxMonitor = new InboxMonitor(
          this.config.inbox,
          toProcess,
          {
            onConfirmation: (brokerId, url, success) => {
              if (!success) return;
              const req = requestRepo.getLatestForBroker(brokerId);
              if (!req) return;
              requestRepo.updateStatus(req.id, REQUEST_STATUS.confirmed);
              brokerResponseRepo.create({
                requestId: req.id,
                responseType: "confirmation",
                rawBodyHash: simpleHash(url),
                confirmationUrl: url,
                urlDomain: extractDomain(url),
              });
              logger.info({ brokerId }, "Confirmation auto-processed from inbox");
            },
            onNewEmail: (from, subject) => {
              logger.debug({ from, subject }, "New email received in monitor");
            },
          }
        );
        // Non-blocking: monitor runs in background during pipeline
        inboxMonitor.start().catch((err) => {
          logger.warn({ err }, "Inbox monitor error");
        });
        logger.info("Inbox monitor started");
      } catch (err) {
        logger.warn({ err }, "Failed to start inbox monitor");
      }
    }

    const summary: PipelineSummary = {
      totalBrokers: toProcess.length,
      sent: 0,
      failed: 0,
      skipped: validitySkippedCount,
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

        // Profile verification: check listing exists before sending
        if (broker.verify_before_send && broker.search_url && browser && !dryRun) {
          requestRepo.updateStatus(request.id, REQUEST_STATUS.scanning);

          const { verifyProfileListing } = await import("../browser/removal-engine.js");
          const verification = await verifyProfileListing(browser, broker, this.config.profile, {
            timeoutMs: this.config.browser.timeout_ms,
          });

          if (!verification.found) {
            requestRepo.updateStatus(request.id, REQUEST_STATUS.skipped);
            summary.skipped++;
            pipelineRunRepo.incrementSkipped(pipelineRun.id);
            logger.info({ brokerId: broker.id }, "Profile not listed — skipping removal request");
            continue;
          }

          requestRepo.updateStatus(request.id, REQUEST_STATUS.matched);
        } else if (broker.verify_before_send && !browser && !dryRun) {
          logger.debug(
            { brokerId: broker.id },
            "verify_before_send set but no browser available — sending without verification"
          );
        }

        // Process email removal
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

        // Process web form removal
        let webFormSucceeded = false;
        if (
          broker.removal_method === "web_form" ||
          broker.removal_method === "hybrid"
        ) {
          const playbook = this.playbooks.get(broker.id);

          if (playbook && browser && !dryRun) {
            // Tier 2: deterministic playbook execution
            webFormSucceeded = await this.processPlaybookRemoval(
              broker, request.id, requestRepo, pendingTaskRepo, browser, playbook
            );
            if (!webFormSucceeded) {
              summary.manualRequired++;
            }
          } else if (browser && !dryRun) {
            // Tier 3: AI-powered Stagehand fallback
            webFormSucceeded = await this.processWebRemoval(
              broker,
              request.id,
              requestRepo,
              pendingTaskRepo,
              browser
            );
            if (!webFormSucceeded) {
              summary.manualRequired++;
            }
          } else {
            pendingTaskRepo.create({
              requestId: request.id,
              taskType: "manual_form",
              description: `Submit opt-out form at ${broker.opt_out_url ?? broker.domain}`,
              url: broker.opt_out_url,
            });
            summary.manualRequired++;
          }
        }

        // Update final status
        if (broker.removal_method === "email" || broker.removal_method === "hybrid") {
          requestRepo.updateStatus(request.id, REQUEST_STATUS.sent);
          circuitBreaker.recordSuccess(broker.id);
          summary.sent++;
          pipelineRunRepo.incrementSent(pipelineRun.id);
        } else {
          // web_form only
          if (webFormSucceeded) {
            requestRepo.updateStatus(request.id, REQUEST_STATUS.sent);
            circuitBreaker.recordSuccess(broker.id);
            summary.sent++;
          } else {
            requestRepo.updateStatus(request.id, REQUEST_STATUS.manual_required);
          }
          pipelineRunRepo.incrementSent(pipelineRun.id);
        }

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

    // Stop inbox monitor
    if (inboxMonitor) {
      await inboxMonitor.stop();
    }

    // Close browser
    if (browser) {
      try {
        const { closeBrowser } = await import("../browser/session.js");
        await closeBrowser();
      } catch (err) {
        logger.warn({ err }, "Error closing browser");
      }
    }

    // Cleanup email sender
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

        if (result.rejected.length > 0 && result.accepted.length === 0) {
          throw new EmailError(`Email rejected by server for all recipients: ${broker.email}`);
        }
      },
      retryOptions,
      `email to ${broker.name}`
    );
  }

  private async processWebRemoval(
    broker: Broker,
    requestId: number,
    requestRepo: RemovalRequestRepo,
    pendingTaskRepo: PendingTaskRepo,
    browser: import("../browser/session.js").StagehandInstance
  ): Promise<boolean> {
    const { executeWebRemoval } = await import("../browser/removal-engine.js");

    requestRepo.updateStatus(requestId, REQUEST_STATUS.sending);
    requestRepo.incrementAttempt(requestId);

    const result = await executeWebRemoval(browser, broker, this.config.profile, {
      timeoutMs: this.config.browser.timeout_ms,
    });

    if (result.success) {
      if (result.screenshotPath) {
        requestRepo.setScreenshot(requestId, result.screenshotPath);
      }
      logger.info({ brokerId: broker.id }, "Web form removal completed via browser");
      return true;
    } else {
      // Fall back to manual task queue
      pendingTaskRepo.create({
        requestId,
        taskType: "manual_form",
        description: result.requiresCaptcha
          ? `Submit opt-out form at ${broker.opt_out_url ?? broker.domain} (CAPTCHA required)`
          : `Submit opt-out form at ${broker.opt_out_url ?? broker.domain}`,
        url: broker.opt_out_url,
      });
      return false;
    }
  }

  private async processPlaybookRemoval(
    broker: Broker,
    requestId: number,
    requestRepo: RemovalRequestRepo,
    pendingTaskRepo: PendingTaskRepo,
    browser: import("../browser/session.js").StagehandInstance,
    playbook: Playbook
  ): Promise<boolean> {
    requestRepo.updateStatus(requestId, REQUEST_STATUS.sending);
    requestRepo.incrementAttempt(requestId);

    const executor = new PlaybookExecutor(
      browser.page as any,
      this.config.profile
    );
    const result = await executor.execute(playbook);

    if (result.success) {
      if (result.screenshotPath) {
        requestRepo.setScreenshot(requestId, result.screenshotPath);
      }
      logger.info({ brokerId: broker.id }, "Playbook removal completed");
      return true;
    }

    // Playbook failed — try self-healing if browser supports extract()
    if (result.failedStep?.selector) {
      try {
        const { repairSelector, applyRepair } = await import("../playbook/repair.js");
        const domSnippet = await (browser.page as any).extract(
          "Return the HTML of the main form on this page, max 2000 characters"
        ) as string;

        const newSelector = await repairSelector(browser as any, {
          brokerId: broker.id,
          failedSelector: result.failedStep.selector,
          stepAction: result.failedStep.action,
          pageUrl: (browser.page as any).url(),
          domSnippet: typeof domSnippet === "string" ? domSnippet : JSON.stringify(domSnippet),
        });

        if (newSelector) {
          const repaired = applyRepair(playbook, {
            phase: result.failedStep.phase,
            action: result.failedStep.action,
            oldSelector: result.failedStep.selector,
            newSelector,
          });

          // Retry with repaired playbook
          const retryResult = await executor.execute(repaired);
          if (retryResult.success) {
            // Save repaired playbook to disk
            const { writeFileSync } = await import("node:fs");
            const yamlLib = (await import("js-yaml")).default;
            const defaultDir = join(dirname(fileURLToPath(import.meta.url)), "../../data/playbooks");
            const playbookPath = join(defaultDir, `${broker.id}.yaml`);
            writeFileSync(playbookPath, yamlLib.dump(repaired));
            logger.info({ brokerId: broker.id }, "Playbook self-healed and saved");

            if (retryResult.screenshotPath) {
              requestRepo.setScreenshot(requestId, retryResult.screenshotPath);
            }
            return true;
          }
        }
      } catch (err) {
        logger.warn({ brokerId: broker.id, err }, "Self-healing repair failed");
      }
    }

    // Fall back to manual task
    pendingTaskRepo.create({
      requestId,
      taskType: "manual_form",
      description: `Playbook failed for ${broker.opt_out_url ?? broker.domain}: ${result.error}`,
      url: broker.opt_out_url,
    });
    return false;
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

// Lightweight helpers used only in the inbox monitor callback
function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16);
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
