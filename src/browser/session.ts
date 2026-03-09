import type { BrowserConfig } from "../types/config.js";
import { BrowserError } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { BrowserProfileStore } from "./profile-store.js";
import { join } from "node:path";
import { homedir } from "node:os";

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

const DEFAULT_PROFILE_DIR = join(homedir(), ".brokerbane", "browser-profiles");
let profileStore: BrowserProfileStore | null = null;

export function getProfileStore(): BrowserProfileStore {
  if (!profileStore) {
    profileStore = new BrowserProfileStore(DEFAULT_PROFILE_DIR);
  }
  return profileStore;
}

export async function loadProfileCookies(page: unknown, domain: string): Promise<void> {
  const store = getProfileStore();
  const state = store.load(domain);
  if (!state || state.cookies.length === 0) return;

  try {
    const ctx = (page as any).context?.();
    if (ctx?.addCookies) {
      await ctx.addCookies(state.cookies);
      logger.debug({ domain, count: state.cookies.length }, "Loaded saved cookies");
    }
  } catch (err) {
    logger.warn({ domain, err }, "Failed to load profile cookies");
  }
}

export async function saveProfileCookies(page: unknown, domain: string): Promise<void> {
  const store = getProfileStore();
  try {
    const ctx = (page as any).context?.();
    if (ctx?.cookies && ctx?.storageState) {
      const state = await ctx.storageState();
      store.save(domain, { cookies: state.cookies ?? [], origins: state.origins ?? [] });
      logger.debug({ domain }, "Saved profile cookies");
    }
  } catch (err) {
    logger.warn({ domain, err }, "Failed to save profile cookies");
  }
}

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
      logger.info("Using local browser");
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
