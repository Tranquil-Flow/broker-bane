import type { Profile } from "../types/config.js";
import type { Playbook, PlaybookStep } from "./schema.js";
import { resolveTemplateValue } from "./template.js";
import { logger } from "../util/logger.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

export interface PlaybookResult {
  success: boolean;
  screenshotPath?: string;
  error?: string;
  failedStep?: { phase: string; action: string; selector?: string };
  requiresManualAction?: boolean;
}

// Use a minimal Page interface instead of importing from @playwright/test
// to avoid a hard dependency on playwright at the type level
interface PlaywrightPage {
  goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number }): Promise<unknown>;
  screenshot(): Promise<Buffer>;
  selectOption(selector: string, value: string): Promise<unknown>;
  check(selector: string): Promise<void>;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_SCREENSHOT_DIR = join(homedir(), ".brokerbane", "screenshots");

export class PlaybookExecutor {
  constructor(
    private readonly page: PlaywrightPage,
    private readonly profile: Profile,
    private readonly screenshotDir: string = DEFAULT_SCREENSHOT_DIR,
  ) {}

  async execute(playbook: Playbook): Promise<PlaybookResult> {
    logger.info({ brokerId: playbook.broker_id }, "Executing playbook");

    for (const phase of playbook.phases) {
      logger.debug({ brokerId: playbook.broker_id, phase: phase.name }, "Starting phase");

      for (const step of phase.steps) {
        try {
          await this.executeStep(step, playbook.broker_id);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            { brokerId: playbook.broker_id, phase: phase.name, action: step.action, err: message },
            "Playbook step failed",
          );

          // Capture error screenshot
          let screenshotPath: string | undefined;
          try {
            screenshotPath = await this.captureScreenshot(playbook.broker_id, "error");
          } catch { /* ignore screenshot failure */ }

          return {
            success: false,
            screenshotPath,
            error: message,
            failedStep: {
              phase: phase.name,
              action: step.action,
              selector: "selector" in step ? (step as { selector: string }).selector : undefined,
            },
            requiresManualAction: true,
          };
        }
      }
    }

    // Capture success screenshot
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await this.captureScreenshot(playbook.broker_id, "success");
    } catch { /* ignore */ }

    logger.info({ brokerId: playbook.broker_id }, "Playbook completed successfully");
    return { success: true, screenshotPath };
  }

  private async executeStep(step: PlaybookStep, brokerId: string): Promise<void> {
    switch (step.action) {
      case "goto":
        await this.page.goto(step.url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
        break;

      case "fill": {
        const value = resolveTemplateValue(step.value, this.profile);
        await this.page.fill(step.selector, value);
        break;
      }

      case "click":
        await this.page.click(step.selector);
        break;

      case "wait":
        if (step.ms) {
          await this.page.waitForTimeout(step.ms);
        }
        if (step.selector) {
          await this.page.waitForSelector(step.selector, { timeout: DEFAULT_TIMEOUT });
        }
        break;

      case "screenshot": {
        await this.captureScreenshot(brokerId, step.label);
        break;
      }

      case "select":
        await this.page.selectOption(step.selector, step.value);
        break;

      case "check":
        await this.page.check(step.selector);
        break;
    }
  }

  private async captureScreenshot(brokerId: string, label: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const path = join(this.screenshotDir, `${brokerId}_${label}_${timestamp}.png`);
    mkdirSync(dirname(path), { recursive: true });
    const buffer = await this.page.screenshot();
    writeFileSync(path, buffer);
    return path;
  }
}
