import type { CaptchaDetection } from "./detector.js";
import type { CaptchaConfig } from "../types/config.js";
import { CaptchaError } from "../util/errors.js";
import { logger } from "../util/logger.js";

export interface SolveResult {
  token: string;
  type: string;
}

let dailySolveCount = 0;
let lastResetDate = new Date().toDateString();

function checkAndResetDailyCount(): void {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    dailySolveCount = 0;
    lastResetDate = today;
  }
}

export async function solveCaptcha(
  detection: CaptchaDetection,
  pageUrl: string,
  config: CaptchaConfig
): Promise<SolveResult | null> {
  checkAndResetDailyCount();

  if (dailySolveCount >= config.daily_limit) {
    logger.warn(
      { count: dailySolveCount, limit: config.daily_limit },
      "Daily CAPTCHA solve limit reached"
    );
    return null;
  }

  if (!config.api_key) {
    logger.warn("No CAPTCHA solver API key configured");
    return null;
  }

  if (detection.type === "none") {
    return null;
  }

  try {
    // Dynamic import of nopecha
    const nopechaModule = await import("nopecha");
    const NopeCHA = nopechaModule.default ?? nopechaModule;

    const nopecha = new NopeCHA({ key: config.api_key });

    let token: string;

    switch (detection.type) {
      case "recaptcha_v2":
      case "recaptcha_v3":
        token = await nopecha.solve({
          type: "recaptcha2",
          sitekey: detection.siteKey ?? "",
          url: pageUrl,
        });
        break;
      case "hcaptcha":
        token = await nopecha.solve({
          type: "hcaptcha",
          sitekey: detection.siteKey ?? "",
          url: pageUrl,
        });
        break;
      case "turnstile":
        token = await nopecha.solve({
          type: "turnstile",
          sitekey: detection.siteKey ?? "",
          url: pageUrl,
        });
        break;
      default:
        logger.warn({ type: detection.type }, "Unsupported CAPTCHA type");
        return null;
    }

    dailySolveCount++;
    logger.info(
      { type: detection.type, dailyCount: dailySolveCount },
      "CAPTCHA solved"
    );

    return { token, type: detection.type };
  } catch (err) {
    throw new CaptchaError(`Failed to solve ${detection.type} CAPTCHA`, err);
  }
}

export function getDailySolveCount(): number {
  checkAndResetDailyCount();
  return dailySolveCount;
}

export function resetDailySolveCount(): void {
  dailySolveCount = 0;
}
