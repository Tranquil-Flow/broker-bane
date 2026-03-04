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
import { PlaybookExecutor } from "../../src/playbook/executor.js";
import type { Profile } from "../../src/types/config.js";
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

// ─── Live submission tests ──────────────────────────────────────────────────

// Fake test profile — never submits real PII
const testProfile: Profile = {
  first_name: "Jane",
  last_name: "Testington",
  email: "jane.testington.brokerbane@gmail.com",
  address: "123 Test Street",
  city: "Springfield",
  state: "IL",
  zip: "62704",
  country: "US",
  phone: "555-000-0000",
  aliases: [],
};

const easyBrokers = [
  "spokeo",
  "whitepages",
  "peoplefinder",
  "truepeoplesearch",
];

const llmKey = process.env.STAGEHAND_LLM_KEY;
const canRunLive = canRun && Boolean(llmKey);

describe.skipIf(!canRunLive)(
  "Playbook live submission (top 5 easy brokers)",
  { timeout: 300_000 },
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

    for (const brokerId of easyBrokers) {
      const playbook = playbooks.get(brokerId);
      if (!playbook) continue;

      it(`${brokerId}: full playbook execution completes without error`, async () => {
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
          const executor = new PlaybookExecutor(page as any, testProfile);
          const result = await executor.execute(playbook);

          // We don't require success (form may reject fake data or change layout)
          // but the executor should not throw and should return a structured result
          expect(result).toBeDefined();
          expect(typeof result.success).toBe("boolean");

          if (result.success) {
            expect(result.screenshotPath).toBeDefined();
          } else {
            // Log but don't fail — form may not accept test data
            console.log(
              `${brokerId}: playbook returned failure: ${result.error}`,
            );
            expect(result.failedStep).toBeDefined();
          }
        } finally {
          await context.close();
        }
      });
    }
  },
);
