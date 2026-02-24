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

    const stagehand = new Stagehand({
      env: "LOCAL",
      enableCaching: true,
      headless: config.headless,
      modelName: config.model,
      modelClientOptions: {
        apiKey: config.api_key,
      },
    });

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
