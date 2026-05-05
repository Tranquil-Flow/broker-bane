import type { BatchPreview, OrchestratorOptions, PipelineSummary } from "./orchestrator.js";
import type { RetryWorkerResult, RetryWorkerRunOptions } from "./retry-worker.js";

export interface AutopilotOrchestrator {
  preview(options?: OrchestratorOptions): Promise<BatchPreview>;
  run(options?: OrchestratorOptions): Promise<PipelineSummary>;
  cleanup?(): Promise<void> | void;
  abort?(): void;
}

export interface AutopilotRetryWorker {
  processReady(options?: RetryWorkerRunOptions): Promise<RetryWorkerResult>;
}

export interface AutopilotConfirmationWorker {
  start(): Promise<unknown>;
  stop(): Promise<void>;
}

export type AutopilotSkippedRunReason = "daily_cap_reached" | "no_brokers_today";

export interface AutopilotRunnerInit {
  orchestrator: AutopilotOrchestrator;
  retryWorker?: AutopilotRetryWorker;
  confirmationWorker?: AutopilotConfirmationWorker;
  retryLimit?: number;
  testMode?: boolean;
  sleep?: (ms: number) => Promise<void>;
  sleepMs?: number;
}

export interface AutopilotCycleOptions {
  brokerIds?: string[];
  methods?: Array<"email" | "web" | "all">;
  dryRun?: boolean;
}

export interface AutopilotCycleResult {
  preview: BatchPreview;
  pipeline?: PipelineSummary;
  retry?: RetryWorkerResult;
  skippedRunReason?: AutopilotSkippedRunReason;
}

export interface AutopilotLoopOptions extends AutopilotCycleOptions {
  maxCycles?: number;
  onCycle?: (result: AutopilotCycleResult) => void | Promise<void>;
}

const DEFAULT_RETRY_LIMIT = 5;
const DEFAULT_SLEEP_MS = 60 * 60 * 1000;

export class AutopilotRunner {
  private stopped = false;

  constructor(private readonly init: AutopilotRunnerInit) {}

  async runCycle(options: AutopilotCycleOptions = {}): Promise<AutopilotCycleResult> {
    const previewOptions: OrchestratorOptions = {
      brokerIds: options.brokerIds,
      methods: options.methods,
      resume: true,
    };
    const preview = await this.init.orchestrator.preview(previewOptions);
    const result: AutopilotCycleResult = { preview };

    if (preview.limitReached) {
      result.skippedRunReason = "daily_cap_reached";
    } else if (preview.today.length === 0) {
      result.skippedRunReason = "no_brokers_today";
    } else {
      result.pipeline = await this.init.orchestrator.run({
        brokerIds: options.brokerIds,
        methods: options.methods,
        resume: true,
        dryRun: this.init.testMode ? true : options.dryRun ?? false,
      });
    }

    if (this.init.retryWorker) {
      result.retry = await this.init.retryWorker.processReady({
        limit: this.init.retryLimit ?? DEFAULT_RETRY_LIMIT,
      });
    }

    return result;
  }

  async runLoop(options: AutopilotLoopOptions = {}): Promise<AutopilotCycleResult[]> {
    this.stopped = false;
    const results: AutopilotCycleResult[] = [];
    const sleep = this.init.sleep ?? defaultSleep;
    const sleepMs = this.init.sleepMs ?? DEFAULT_SLEEP_MS;

    await this.init.confirmationWorker?.start();
    try {
      while (!this.stopped && (options.maxCycles === undefined || results.length < options.maxCycles)) {
        const result = await this.runCycle(options);
        results.push(result);
        await options.onCycle?.(result);

        if (this.stopped || (options.maxCycles !== undefined && results.length >= options.maxCycles)) break;
        await sleep(sleepMs);
      }
    } finally {
      await this.init.confirmationWorker?.stop();
      await this.init.orchestrator.cleanup?.();
    }
    return results;
  }

  stop(): void {
    this.stopped = true;
    this.init.orchestrator.abort?.();
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
