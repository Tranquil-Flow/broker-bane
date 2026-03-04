/**
 * Playbook selector health-check integration tests.
 *
 * Connects to Browserbase (or local Playwright), navigates to each broker's
 * opt-out page, and verifies that every playbook selector resolves to at least
 * one real DOM element.
 *
 * Required env vars:
 *   BROWSERBASE_API_KEY    - Browserbase cloud browser API key
 *   BROWSERBASE_PROJECT_ID - Browserbase project ID
 *
 * Skipped automatically when env vars are missing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "@playwright/test";
import { loadAllPlaybooks } from "../../src/playbook/loader.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const bbApiKey = process.env.BROWSERBASE_API_KEY;
const bbProjectId = process.env.BROWSERBASE_PROJECT_ID;
const canRun = Boolean(bbApiKey && bbProjectId);

const playbookDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../data/playbooks",
);

describe.skipIf(!canRun)(
  "Playbook selector health checks",
  { timeout: 180_000 },
  () => {
    let browser: Browser;

    beforeAll(async () => {
      if (bbApiKey) {
        browser = await chromium.connectOverCDP(
          `wss://connect.browserbase.com?apiKey=${bbApiKey}&projectId=${bbProjectId}`,
        );
      } else {
        browser = await chromium.launch({ headless: true });
      }
    });

    afterAll(async () => {
      await browser?.close();
    });

    const playbooks = loadAllPlaybooks(playbookDir);

    for (const [brokerId, playbook] of playbooks) {
      it(`${brokerId}: all selectors resolve on opt-out page`, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
          for (const phase of playbook.phases) {
            for (const step of phase.steps) {
              if (step.action === "goto") {
                await page.goto(step.url, {
                  waitUntil: "domcontentloaded",
                  timeout: 15_000,
                });
                // Allow dynamic content to load
                await page.waitForTimeout(2000);
                continue;
              }

              if ("selector" in step) {
                const selector = (step as { selector: string }).selector;
                // Try each comma-separated selector alternative
                const selectors = selector.split(",").map((s) => s.trim());
                let found = false;

                for (const sel of selectors) {
                  try {
                    const count = await page.locator(sel).count();
                    if (count > 0) {
                      found = true;
                      break;
                    }
                  } catch {
                    // Selector parse error - try next alternative
                  }
                }

                expect(
                  found,
                  `Selector "${selector}" not found on ${brokerId} page`,
                ).toBe(true);
              }
            }
          }
        } finally {
          await context.close();
        }
      });
    }
  },
);
