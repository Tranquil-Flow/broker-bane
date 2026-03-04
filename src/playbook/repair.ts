import type { Playbook } from "./schema.js";
import { logger } from "../util/logger.js";

export interface RepairContext {
  brokerId: string;
  failedSelector: string;
  stepAction: string;
  pageUrl: string;
  domSnippet: string;
}

export interface RepairPatch {
  phase: string;
  action: string;
  oldSelector: string;
  newSelector: string;
}

export function buildRepairPrompt(ctx: RepairContext): string {
  return [
    `A BrokerBane playbook for "${ctx.brokerId}" has a broken CSS selector.`,
    ``,
    `Page URL: ${ctx.pageUrl}`,
    `Step action: ${ctx.stepAction}`,
    `Expected selector: ${ctx.failedSelector}`,
    `This selector no longer matches any element on the page.`,
    ``,
    `Here is the relevant DOM fragment from the page:`,
    "```html",
    ctx.domSnippet,
    "```",
    ``,
    `What is the correct CSS selector for this element? Reply with ONLY the CSS selector string, nothing else.`,
    `Use standard CSS selectors. Prefer attribute selectors (input[type="email"]) over fragile class names.`,
  ].join("\n");
}

export function applyRepair(playbook: Playbook, patch: RepairPatch): Playbook {
  const updated = structuredClone(playbook);
  updated.version += 1;
  updated.last_verified = new Date().toISOString().split("T")[0];

  for (const phase of updated.phases) {
    if (phase.name !== patch.phase) continue;
    for (const step of phase.steps) {
      if (
        step.action === patch.action &&
        "selector" in step &&
        (step as { selector: string }).selector === patch.oldSelector
      ) {
        (step as { selector: string }).selector = patch.newSelector;
        logger.info(
          { brokerId: playbook.broker_id, old: patch.oldSelector, new: patch.newSelector },
          "Playbook selector repaired"
        );
        return updated;
      }
    }
  }

  return updated;
}

/**
 * Attempt to repair a broken playbook step by asking the LLM to inspect the page.
 * Uses Stagehand's extract() to get the LLM's answer.
 */
export async function repairSelector(
  browser: { page: { extract(instruction: string): Promise<unknown> } },
  ctx: RepairContext
): Promise<string | null> {
  try {
    const prompt = buildRepairPrompt(ctx);
    const result = await browser.page.extract(prompt);

    const selector = typeof result === "string"
      ? result.trim()
      : typeof result === "object" && result !== null && "selector" in result
        ? String((result as { selector: string }).selector).trim()
        : null;

    if (selector && selector.length > 0 && selector.length < 500) {
      logger.info({ brokerId: ctx.brokerId, newSelector: selector }, "LLM suggested repair selector");
      return selector;
    }

    return null;
  } catch (err) {
    logger.warn({ brokerId: ctx.brokerId, err }, "Selector repair failed");
    return null;
  }
}
