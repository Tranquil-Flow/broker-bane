import type { BrowserConfig } from "../types/config.js";
import { BrowserError } from "../util/errors.js";
import { logger } from "../util/logger.js";

// Stagehand types - kept loose since package may not be installed
interface StagehandPage {
  act(instruction: string): Promise<unknown>;
  extract(instruction: string, schema?: unknown): Promise<unknown>;
  observe(instruction: string): Promise<unknown[]>;
  goto(url: string): Promise<void>;
  url(): string;
  screenshot(): Promise<Buffer>;
}

interface StagehandInstance {
  init(): Promise<void>;
  page: StagehandPage;
  close(): Promise<void>;
}

let instance: StagehandInstance | null = null;

export async function initBrowser(config: BrowserConfig): Promise<StagehandInstance> {
  if (instance) return instance;

  try {
    const { Stagehand } = await import("@browserbasehq/stagehand");

    const useBrowserbase = Boolean(config.browserbase_api_key);

    const stagehandOptions: Record<string, unknown> = {
      enableCaching: true,
      headless: config.headless,
      modelName: config.model,
      modelClientOptions: {
        apiKey: config.api_key,
      },
    };

    if (useBrowserbase) {
      stagehandOptions.env = "BROWSERBASE";
      stagehandOptions.apiKey = config.browserbase_api_key;
      stagehandOptions.projectId = config.browserbase_project_id;
      logger.info("Using Browserbase cloud browser");
    } else {
      stagehandOptions.env = "LOCAL";

      // Try to set up patchright with fingerprint injection for anti-detection
      try {
        const { FingerprintGenerator } = await import("fingerprint-generator");
        const { newInjectedContext } = await import("fingerprint-injector");
        const { chromium } = await import("patchright");

        const fingerprintGenerator = new FingerprintGenerator();

        const fingerprint = fingerprintGenerator.getFingerprint({
          browsers: [{ name: "chrome", minVersion: 120 }],
          operatingSystems: ["macos", "windows"],
        });

        const browser = await chromium.launch({
          headless: config.headless,
        });

        const browserContext = await newInjectedContext(browser as any, {
          fingerprint,
        });

        stagehandOptions.browserContext = browserContext;
        logger.info("Using local browser (patchright) with fingerprint injection");
      } catch (fingerprintErr) {
        logger.warn(
          { err: fingerprintErr },
          "Fingerprint injection unavailable, falling back to default browser"
        );
        logger.info("Using local browser (patchright)");
      }
    }

    const stagehand = new Stagehand(stagehandOptions as any);

    await stagehand.init();
    instance = stagehand as unknown as StagehandInstance;
    logger.info("Browser session initialized");
    return instance;
  } catch (err) {
    throw new BrowserError("Failed to initialize browser session", err);
  }
}

export async function getBrowser(): Promise<StagehandInstance> {
  if (!instance) {
    throw new BrowserError("Browser not initialized. Call initBrowser() first.");
  }
  return instance;
}

export async function closeBrowser(): Promise<void> {
  if (instance) {
    try {
      await instance.close();
      logger.info("Browser session closed");
    } catch (err) {
      logger.warn({ err }, "Error closing browser session");
    } finally {
      instance = null;
    }
  }
}

export function isBrowserInitialized(): boolean {
  return instance !== null;
}

export type { StagehandInstance, StagehandPage };
