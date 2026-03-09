import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import { BrokerStore } from "../data/broker-store.js";
import { PlaybookGenerator } from "../playbook/generator.js";
import { loadAllPlaybooks } from "../playbook/loader.js";
import { randomDelay } from "../util/delay.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Broker } from "../types/broker.js";
import type { CaptchaHooks } from "../playbook/executor.js";

export async function generatePlaybookCommand(options: {
  broker?: string;
  allMissing?: boolean;
  dryRun?: boolean;
  config?: string;
}): Promise<void> {
  const config = loadConfig(options.config);
  reconfigureLogger({
    level: config.logging.level,
    file: config.logging.file,
    redactPii: config.logging.redact_pii,
  });

  const defaultDir = join(dirname(fileURLToPath(import.meta.url)), "../../data/playbooks");
  const brokerDb = loadBrokerDatabase();
  const store = new BrokerStore(brokerDb.brokers);

  // Determine which brokers to generate for
  let targets: Broker[] = [];

  if (options.broker) {
    const broker = store.getById(options.broker);
    if (!broker) {
      console.error(`  Broker not found: ${options.broker}`);
      process.exit(1);
    }
    if (!broker.opt_out_url) {
      console.error(`  Broker ${options.broker} has no opt_out_url — cannot generate playbook.`);
      process.exit(1);
    }
    targets = [broker];
  } else if (options.allMissing) {
    const existingPlaybooks = loadAllPlaybooks(defaultDir);
    targets = brokerDb.brokers.filter(
      (b) => b.opt_out_url && !b.email && !existingPlaybooks.has(b.id)
    );
  } else {
    console.error("  Specify --broker <id> or --all-missing");
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(`\n  Would generate playbooks for ${targets.length} brokers:\n`);
    for (const b of targets.slice(0, 20)) {
      console.log(`    ${b.id} — ${b.opt_out_url}`);
    }
    if (targets.length > 20) {
      console.log(`    ... and ${targets.length - 20} more`);
    }
    console.log();
    return;
  }

  if (targets.length === 0) {
    console.log("  No brokers need playbook generation.");
    return;
  }

  if (!config.browser.api_key) {
    console.error("  Error: AI API key required for playbook generation.");
    console.error("  Set browser.api_key in your config or BROKERBANE_BROWSER_API_KEY env var.");
    process.exit(1);
  }

  // Initialize browser
  const { initBrowser, closeBrowser } = await import("../browser/session.js");
  const browser = await initBrowser(config.browser);

  // Build CAPTCHA hooks if available
  let captchaHooks: CaptchaHooks | undefined;
  if (config.captcha.api_key) {
    const { detectCaptcha } = await import("../captcha/detector.js");
    const { solveCaptcha } = await import("../captcha/solver.js");
    captchaHooks = {
      detectCaptcha: () => detectCaptcha(browser),
      solveCaptcha: (detection, pageUrl) => solveCaptcha(detection, pageUrl, config.captcha),
    };
  }

  const generator = new PlaybookGenerator(browser, config.profile, defaultDir, captchaHooks);

  let generated = 0;
  let verified = 0;
  let failed = 0;

  console.log(`\n  Generating playbooks for ${targets.length} brokers...\n`);

  for (let i = 0; i < targets.length; i++) {
    const broker = targets[i];

    // Rate limit: pause between brokers in batch mode to avoid blocks
    if (i > 0 && options.allMissing) {
      await randomDelay(config.options.delay_min_ms, config.options.delay_max_ms);
    }

    try {
      const result = await generator.generate(broker);
      if (result.playbook) {
        generated++;
        if (result.verified) verified++;
        console.log(`  + ${broker.id} — ${result.verified ? "verified" : "unverified"}`);
      } else {
        failed++;
        console.log(`  x ${broker.id} — ${result.error}`);
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  x ${broker.id} — ${msg}`);
    }
  }

  await closeBrowser();

  console.log(`\n  Done: ${generated} generated (${verified} verified), ${failed} failed\n`);
}
