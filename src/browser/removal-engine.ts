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

export interface VerifyResult {
  found: boolean;
  pageText?: string;
  screenshotPath?: string;
}

export async function verifyProfileListing(
  browser: StagehandInstance,
  broker: Broker,
  profile: Profile,
  options: { timeoutMs?: number; screenshotDir?: string } = {}
): Promise<VerifyResult> {
  const { timeoutMs = 20_000 } = options;
  const searchUrl = broker.search_url ?? `https://${broker.domain}`;

  try {
    logger.info({ brokerId: broker.id, url: searchUrl }, "Verifying profile listing");
    await withTimeout(browser.page.goto(searchUrl), timeoutMs);
    await randomDelay(1000, 2000);

    const fullName = `${profile.first_name} ${profile.last_name}`;
    const searchInstruction = profile.state
      ? `Search for "${fullName}" from ${profile.state}`
      : `Search for "${fullName}"`;
    await withTimeout(browser.page.act(searchInstruction), timeoutMs);
    await randomDelay(1500, 3000);

    const result = await withTimeout(
      browser.page.extract(
        `Is there a person record or listing for "${fullName}" in the search results? ` +
          `Return JSON with field "found" as true if a matching result is visible, false if no results found.`
      ) as Promise<{ found: boolean }>,
      timeoutMs
    );

    const found = Boolean((result as { found?: boolean })?.found);

    // Capture page text and screenshot for evidence chain
    let pageText: string | undefined;
    let screenshotPath: string | undefined;
    try {
      const extracted = await withTimeout(
        browser.page.extract(
          "Return all visible text content on the page, especially any names, addresses, phone numbers, and ages shown."
        ) as Promise<string>,
        timeoutMs
      );
      pageText = typeof extracted === "string" ? extracted : JSON.stringify(extracted);
    } catch {
      // Non-critical: evidence capture is best-effort
    }
    try {
      screenshotPath = await captureScreenshot(browser, broker.id, "verify", options.screenshotDir);
    } catch {
      // Non-critical
    }

    logger.info({ brokerId: broker.id, found }, "Profile verification complete");
    return { found, pageText, screenshotPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ brokerId: broker.id, err: message }, "Profile verification error — proceeding with removal");
    // Fail open: if verification errors, proceed rather than silently skip
    return { found: true };
  }
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
