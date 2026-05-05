import { describe, expect, it, vi } from "vitest";
import { AutopilotRunner } from "../../src/pipeline/autopilot.js";
import type { BatchPreview, PipelineSummary } from "../../src/pipeline/orchestrator.js";
import type { RetryWorkerResult } from "../../src/pipeline/retry-worker.js";

function preview(overrides: Partial<BatchPreview> = {}): BatchPreview {
  return {
    brokerFacingEmail: "removals@example.com",
    identityId: "removals",
    identityMode: "dedicated_mailbox",
    privacyLevel: "maximum",
    dailyLimit: 2,
    sentToday: 0,
    remainingToday: 2,
    limitReached: false,
    totalCandidates: 2,
    validitySkipped: 0,
    today: [
      { id: "alpha", name: "Alpha Broker", method: "email", email: "privacy@alpha.test", tier: 1 },
      { id: "beta", name: "Beta Broker", method: "email", email: "privacy@beta.test", tier: 1 },
    ],
    notInTodayCount: 0,
    ...overrides,
  };
}

function pipelineSummary(overrides: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    totalBrokers: 2,
    sent: 2,
    failed: 0,
    skipped: 0,
    manualRequired: 0,
    limitReached: false,
    dryRun: false,
    ...overrides,
  };
}

function retryResult(overrides: Partial<RetryWorkerResult> = {}): RetryWorkerResult {
  return {
    considered: 0,
    processed: 0,
    succeeded: 0,
    failed: 0,
    requeued: 0,
    removed: 0,
    skippedDailyCap: 0,
    ...overrides,
  };
}

describe("AutopilotRunner", () => {
  it("previews before each cycle, then runs only today's capped broker batch and ready retries", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary()),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const retryWorker = {
      processReady: vi.fn().mockResolvedValue(retryResult({ considered: 1, processed: 1, succeeded: 1, removed: 1 })),
    };
    const runner = new AutopilotRunner({ orchestrator, retryWorker, retryLimit: 3 });

    const result = await runner.runCycle({ brokerIds: ["alpha", "beta"], methods: ["email"] });

    expect(orchestrator.preview).toHaveBeenCalledBefore(orchestrator.run);
    expect(orchestrator.preview).toHaveBeenCalledWith({ brokerIds: ["alpha", "beta"], methods: ["email"], resume: true });
    expect(orchestrator.run).toHaveBeenCalledWith({ brokerIds: ["alpha", "beta"], methods: ["email"], resume: true, dryRun: false });
    expect(retryWorker.processReady).toHaveBeenCalledWith({ limit: 3 });
    expect(result.preview.today.map((broker) => broker.id)).toEqual(["alpha", "beta"]);
    expect(result.pipeline?.sent).toBe(2);
    expect(result.retry?.processed).toBe(1);
    expect(result.skippedRunReason).toBeUndefined();
  });

  it("does not start the removal pipeline when preview says the daily cap is reached", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview({ sentToday: 2, remainingToday: 0, limitReached: true, today: [], notInTodayCount: 2 })),
      run: vi.fn().mockResolvedValue(pipelineSummary()),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const retryWorker = { processReady: vi.fn().mockResolvedValue(retryResult({ considered: 1, skippedDailyCap: 1 })) };
    const runner = new AutopilotRunner({ orchestrator, retryWorker });

    const result = await runner.runCycle();

    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(retryWorker.processReady).toHaveBeenCalled();
    expect(result.skippedRunReason).toBe("daily_cap_reached");
  });

  it("honors test mode by forcing dry-run pipeline execution while still requiring a preview first", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary({ dryRun: true, sent: 0 })),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const runner = new AutopilotRunner({ orchestrator, testMode: true });

    await runner.runCycle();

    expect(orchestrator.preview).toHaveBeenCalledBefore(orchestrator.run);
    expect(orchestrator.run).toHaveBeenCalledWith({ brokerIds: undefined, methods: undefined, resume: true, dryRun: true });
  });

  it("starts and stops a persistent confirmation worker around the watch loop", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary()),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const confirmationWorker = {
      start: vi.fn().mockResolvedValue({ started: true, activeBrokers: 1 }),
      stop: vi.fn().mockResolvedValue(undefined),
    };
    const runner = new AutopilotRunner({ orchestrator, confirmationWorker, sleep: async () => undefined });

    await runner.runLoop({ maxCycles: 1 });

    expect(confirmationWorker.start).toHaveBeenCalledBefore(orchestrator.preview);
    expect(confirmationWorker.stop).toHaveBeenCalledOnce();
  });

  it("stops a watch loop cleanly on abort without starting another cycle", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary()),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const runner = new AutopilotRunner({ orchestrator, sleep: async () => undefined });

    const results = await runner.runLoop({ maxCycles: 3, onCycle: () => runner.stop() });

    expect(results).toHaveLength(1);
    expect(orchestrator.run).toHaveBeenCalledTimes(1);
    expect(orchestrator.abort).toHaveBeenCalledTimes(1);
  });
});
