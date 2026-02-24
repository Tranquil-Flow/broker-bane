import type { StagehandInstance } from "./session.js";
import type { Broker } from "../types/broker.js";
import type { Profile } from "../types/config.js";
import { captureScreenshot } from "./screenshot.js";
import { BrowserError } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { randomDelay } from "../util/delay.js";

export interface RemovalResult {
  success: boolean;
  screenshotPath?: string;
  error?: string;
  requiresManualAction?: boolean;
  requiresCaptcha?: boolean;
}

export async function executeWebRemoval(
  browser: StagehandInstance,
  broker: Broker,
  profile: Profile,
  options: { screenshotDir?: string; timeoutMs?: number } = {}
): Promise<RemovalResult> {
  const { timeoutMs = 30_000 } = options;

  try {
    const optOutUrl = broker.opt_out_url ?? `https://${broker.domain}`;
    logger.info({ brokerId: broker.id, url: optOutUrl }, "Starting web removal");

    // Navigate to opt-out page
    await withTimeout(browser.page.goto(optOutUrl), timeoutMs);
    await randomDelay(1000, 3000);

    // Use form_hints if available, otherwise use generic instructions
    const instruction = broker.form_hints
      ? broker.form_hints
      : buildGenericInstruction(broker, profile);

    // Execute the removal action
    await withTimeout(browser.page.act(instruction), timeoutMs);
    await randomDelay(1000, 2000);

    // Capture success screenshot
    const screenshotPath = await captureScreenshot(
      browser,
      broker.id,
      "success",
      options.screenshotDir
    );

    logger.info({ brokerId: broker.id }, "Web removal completed");
    return { success: true, screenshotPath };
  } catch (err) {
    // Capture error screenshot
    let screenshotPath: string | undefined;
    try {
      screenshotPath = await captureScreenshot(
        browser,
        broker.id,
        "error",
        options.screenshotDir
      );
    } catch {
      // Screenshot failed too, continue
    }

    const message = err instanceof Error ? err.message : String(err);
    logger.error({ brokerId: broker.id, err: message }, "Web removal failed");

    return {
      success: false,
      screenshotPath,
      error: message,
      requiresManualAction: true,
    };
  }
}

function buildGenericInstruction(broker: Broker, profile: Profile): string {
  const parts = [
    `I need to opt out of ${broker.name}.`,
    `Look for an opt-out, removal, or privacy request form.`,
    `Fill in my name: ${profile.first_name} ${profile.last_name}.`,
    `Fill in my email: ${profile.email}.`,
  ];
  if (profile.address) {
    parts.push(`Fill in my address: ${profile.address}, ${profile.city}, ${profile.state} ${profile.zip}.`);
  }
  if (profile.phone) {
    parts.push(`Fill in my phone: ${profile.phone}.`);
  }
  parts.push("Submit the form and confirm the request.");
  return parts.join(" ");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new BrowserError(`Operation timed out after ${ms}ms`)), ms)
    ),
  ]);
}
