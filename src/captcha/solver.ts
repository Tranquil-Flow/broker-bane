import type { CaptchaDetection } from "./detector.js";
import type { CaptchaConfig } from "../types/config.js";
import { CaptchaError } from "../util/errors.js";
import { logger } from "../util/logger.js";

export interface SolveResult {
  token: string;
  type: string;
}

// In-memory fallback when no DB is provided
let memoryCount = 0;
let memoryDate = todayStr();
let activeDb: import("better-sqlite3").Database | null = null;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function setDatabase(db: import("better-sqlite3").Database | null): void {
  activeDb = db;
}

export function getDailySolveCount(db?: import("better-sqlite3").Database): number {
  const store = db ?? activeDb;
  if (store) {
    const today = todayStr();
    const row = store.prepare("SELECT count, date FROM daily_counters WHERE key = ?").get("captcha_solves") as
      | { count: number; date: string }
      | undefined;
    if (!row || row.date !== today) {
      return 0;
    }
    return row.count;
  }
  // In-memory fallback
  if (todayStr() !== memoryDate) {
    memoryCount = 0;
    memoryDate = todayStr();
  }
  return memoryCount;
}

export function incrementDailySolveCount(db?: import("better-sqlite3").Database): void {
  const store = db ?? activeDb;
  if (store) {
    const today = todayStr();
    const row = store.prepare("SELECT count, date FROM daily_counters WHERE key = ?").get("captcha_solves") as
      | { count: number; date: string }
      | undefined;
    if (!row || row.date !== today) {
      store.prepare("INSERT OR REPLACE INTO daily_counters (key, count, date) VALUES (?, 1, ?)").run("captcha_solves", today);
    } else {
      store.prepare("UPDATE daily_counters SET count = count + 1 WHERE key = ?").run("captcha_solves");
    }
    return;
  }
  // In-memory fallback
  if (todayStr() !== memoryDate) {
    memoryCount = 0;
    memoryDate = todayStr();
  }
  memoryCount++;
}

export function resetDailySolveCount(db?: import("better-sqlite3").Database): void {
  const store = db ?? activeDb;
  if (store) {
    store.prepare("DELETE FROM daily_counters WHERE key = ?").run("captcha_solves");
    return;
  }
  memoryCount = 0;
}

export async function solveCaptcha(
  detection: CaptchaDetection,
  pageUrl: string,
  config: CaptchaConfig
): Promise<SolveResult | null> {
  const currentCount = getDailySolveCount();

  if (currentCount >= config.daily_limit) {
    logger.warn(
      { count: currentCount, limit: config.daily_limit },
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

    incrementDailySolveCount();
    logger.info(
      { type: detection.type, dailyCount: getDailySolveCount() },
      "CAPTCHA solved"
    );

    return { token, type: detection.type };
  } catch (err) {
    throw new CaptchaError(`Failed to solve ${detection.type} CAPTCHA`, err);
  }
}
