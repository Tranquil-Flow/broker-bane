/**
 * Live browser integration test using Stagehand + Browserbase.
 * Tests web form removal against a real broker's opt-out page.
 *
 * Required env vars:
 *   BROWSERBASE_API_KEY    — Browserbase cloud browser key
 *   BROWSERBASE_PROJECT_ID — Browserbase project ID
 *   STAGEHAND_LLM_KEY      — LLM API key (Anthropic or OpenAI)
 *   STAGEHAND_PROVIDER     — "anthropic" or "openai" (default: "anthropic")
 *   STAGEHAND_MODEL        — model name (default: "claude-sonnet-4-5-20241022")
 *
 * These tests make real network connections and consume LLM tokens.
 * Skipped automatically if env vars are missing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initBrowser, closeBrowser } from "../../src/browser/session.js";
import { executeWebRemoval, verifyProfileListing } from "../../src/browser/removal-engine.js";
import type { StagehandInstance } from "../../src/browser/session.js";
import type { BrowserConfig, Profile } from "../../src/types/config.js";
import type { Broker } from "../../src/types/broker.js";

const bbApiKey = process.env.BROWSERBASE_API_KEY;
const bbProjectId = process.env.BROWSERBASE_PROJECT_ID;
const llmKey = process.env.STAGEHAND_LLM_KEY;
const provider = (process.env.STAGEHAND_PROVIDER ?? "anthropic") as "anthropic" | "openai";
const model = process.env.STAGEHAND_MODEL ?? "claude-3-5-sonnet-latest";

const canRun = Boolean(bbApiKey && bbProjectId && llmKey);

// Fake profile — never uses real PII
const testProfile: Profile = {
  first_name: "Jane",
  last_name: "Testington",
  email: "jane.testington@example.com",
  address: "123 Test Street",
  city: "Springfield",
  state: "IL",
  zip: "62704",
  country: "US",
  phone: "555-0100",
  aliases: [],
};

// TruePeopleSearch: no captcha, no email confirm, easy difficulty, tier 1
const truePeopleSearchBroker: Broker = {
  id: "truepeoplesearch",
  name: "TruePeopleSearch",
  domain: "truepeoplesearch.com",
  category: "people_search",
  removal_method: "web_form",
  opt_out_url: "https://www.truepeoplesearch.com/removal",
  form_hints:
    "Search for your name on the removal page. If a listing appears, click 'Remove This Record'. " +
    "If prompted, confirm the removal. Record removed immediately — no email confirmation needed.",
  email: undefined,
  regions: ["us"],
  tier: 1,
  difficulty: "easy",
  requires_captcha: false,
  requires_email_confirm: false,
  verify_before_send: true,
  opt_out_validity_days: 30,
  search_url: "https://www.truepeoplesearch.com",
};

describe.skipIf(!canRun)(
  "Browser integration (Stagehand + Browserbase)",
  { timeout: 120_000 },
  () => {
    let browser: StagehandInstance;
    let screenshotDir: string;

    const browserConfig: BrowserConfig = {
      headless: true,
      model,
      provider,
      api_key: llmKey!,
      browserbase_api_key: bbApiKey!,
      browserbase_project_id: bbProjectId!,
      timeout_ms: 60_000,
    };

    beforeAll(async () => {
      screenshotDir = join(tmpdir(), `brokerbane-browser-test-${Date.now()}`);
      mkdirSync(screenshotDir, { recursive: true });

      browser = await initBrowser(browserConfig);
    });

    afterAll(async () => {
      await closeBrowser();
      rmSync(screenshotDir, { recursive: true, force: true });
    });

    it("initializes Browserbase session successfully", () => {
      expect(browser).toBeDefined();
      expect(browser.page).toBeDefined();
    });

    it("navigates to a broker opt-out page", async () => {
      await browser.page.goto("https://www.truepeoplesearch.com/removal");
      const url = browser.page.url();
      expect(url).toContain("truepeoplesearch.com");
    });

    it("executes web form removal and returns a result", async () => {
      const result = await executeWebRemoval(
        browser,
        truePeopleSearchBroker,
        testProfile,
        { screenshotDir, timeoutMs: 60_000 }
      );

      // The removal may succeed or fail (anti-bot, page changes, etc.)
      // but it should always return a well-formed RemovalResult
      expect(result).toHaveProperty("success");
      expect(typeof result.success).toBe("boolean");

      if (result.success) {
        console.info("  Web removal succeeded");
        if (result.screenshotPath) {
          console.info(`  Screenshot: ${result.screenshotPath}`);
        }
      } else {
        console.info(`  Web removal did not succeed: ${result.error}`);
        // Even on failure, the engine should handle it gracefully
        expect(result.requiresManualAction || result.error).toBeTruthy();
      }
    });

    it("verifyProfileListing returns a VerifyResult", async () => {
      const result = await verifyProfileListing(
        browser,
        truePeopleSearchBroker,
        testProfile,
        { timeoutMs: 60_000 }
      );

      // Should return { found: boolean } regardless of actual result
      expect(result).toHaveProperty("found");
      expect(typeof result.found).toBe("boolean");
      console.info(`  Profile listing found: ${result.found}`);
    });
  }
);
