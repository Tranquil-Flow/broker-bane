import { describe, expect, it, vi } from "vitest";
import { AutopilotRunner } from "../../src/pipeline/autopilot.js";
import type { PipelineSummary } from "../../src/pipeline/orchestrator.js";
import type { RetryWorkerResult } from "../../src/pipeline/retry-worker.js";
import { makePreview as preview } from "../fixtures/preview.js";

function pipelineSummary(overrides: Partial<PipelineSummary> = {}): PipelineSummary {
  return {
    totalBrokers: 1,
    sent: 1,
    failed: 0,
    skipped: 0,
    manualRequired: 0,
    limitReached: false,
    dryRun: true,
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

describe("autopilot test-mode side effects", () => {
  it("forces pipeline runs into dry-run even if caller asks for a real run", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary({ dryRun: true })),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const retryWorker = { processReady: vi.fn().mockResolvedValue(retryResult()) };
    const runner = new AutopilotRunner({ orchestrator, retryWorker, testMode: true });

    await runner.runCycle({ dryRun: false });

    expect(orchestrator.run).toHaveBeenCalledOnce();
    expect(orchestrator.run.mock.calls[0][0]).toMatchObject({ dryRun: true });
  });

  it("does not start a confirmation worker when test mode wires it as undefined", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary({ dryRun: true })),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const retryWorker = { processReady: vi.fn().mockResolvedValue(retryResult()) };
    const startSpy = vi.fn();
    const stopSpy = vi.fn();

    const runner = new AutopilotRunner({
      orchestrator,
      retryWorker,
      confirmationWorker: undefined,
      testMode: true,
    });

    await runner.runLoop({ maxCycles: 1 });

    expect(startSpy).not.toHaveBeenCalled();
    expect(stopSpy).not.toHaveBeenCalled();
    expect(orchestrator.run.mock.calls[0][0]).toMatchObject({ dryRun: true });
  });

  it("still invokes the retry worker in test mode (handlers themselves must enforce dryRun)", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary({ dryRun: true })),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const retryWorker = { processReady: vi.fn().mockResolvedValue(retryResult()) };
    const runner = new AutopilotRunner({ orchestrator, retryWorker, testMode: true });

    await runner.runCycle();

    expect(retryWorker.processReady).toHaveBeenCalledOnce();
  });

  it("a runner with no retry worker exits cleanly without throwing", async () => {
    const orchestrator = {
      preview: vi.fn().mockResolvedValue(preview()),
      run: vi.fn().mockResolvedValue(pipelineSummary({ dryRun: true })),
      cleanup: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn(),
    };
    const runner = new AutopilotRunner({ orchestrator, testMode: true });

    const result = await runner.runCycle();

    expect(result.retry).toBeUndefined();
    expect(result.pipeline?.dryRun).toBe(true);
  });
});
