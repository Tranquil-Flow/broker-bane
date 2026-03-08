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

function getBrowserContext(page: unknown): unknown {
  // Stagehand pages expose `context` as a getter property (EnhancedContext).
  // Raw Playwright pages expose `context` as a method: page.context().
  // Handle both so cookie helpers work regardless of which page type is passed.
  const contextProp = (page as any).context;
  if (typeof contextProp === "function") return contextProp.call(page);
  return contextProp ?? null;
}

export async function loadProfileCookies(page: unknown, domain: string): Promise<void> {
  const store = getProfileStore();
  const state = store.load(domain);
  if (!state || state.cookies.length === 0) return;

  try {
    const ctx = getBrowserContext(page) as any;
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
    const ctx = getBrowserContext(page) as any;
    if (ctx?.storageState) {
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
