import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { StagehandInstance } from "./session.js";
import { BrowserError } from "../util/errors.js";
import { logger } from "../util/logger.js";

const DEFAULT_SCREENSHOT_DIR = join(homedir(), ".brokerbane", "screenshots");

export function getScreenshotPath(
  brokerId: string,
  suffix: string,
  dir?: string
): string {
  const screenshotDir = dir ?? DEFAULT_SCREENSHOT_DIR;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(screenshotDir, `${brokerId}_${suffix}_${timestamp}.png`);
}

export async function captureScreenshot(
  browser: StagehandInstance,
  brokerId: string,
  suffix: string,
  dir?: string
): Promise<string> {
  try {
    const path = getScreenshotPath(brokerId, suffix, dir);
    mkdirSync(dirname(path), { recursive: true });

    const buffer = await browser.page.screenshot();
    writeFileSync(path, buffer);

    logger.debug({ brokerId, path }, "Screenshot captured");
    return path;
  } catch (err) {
    throw new BrowserError(`Failed to capture screenshot for ${brokerId}`, err);
  }
}
