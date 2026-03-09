import { logger } from "../util/logger.js";

export interface BlockDetection {
  blocked: boolean;
  reason?: "cloudflare_challenge" | "captcha_wall" | "access_denied";
}

interface PageLike {
  title(): Promise<string>;
  url(): string;
  content(): Promise<string>;
}

interface WaitablePage extends PageLike {
  waitForTimeout(ms: number): Promise<void>;
}

export interface WaitOptions {
  maxWaitMs: number;
  pollIntervalMs: number;
}

const DEFAULT_WAIT_OPTIONS: WaitOptions = {
  maxWaitMs: 12_000,
  pollIntervalMs: 2_000,
};

const TRANSIENT_REASONS: Array<BlockDetection["reason"]> = ["cloudflare_challenge", "captcha_wall"];

export async function detectBlock(page: PageLike): Promise<BlockDetection> {
  try {
    const [title, pageUrl] = await Promise.all([page.title(), page.url()]);
    const titleLower = title.toLowerCase();
    const urlLower = pageUrl.toLowerCase();

    // Cloudflare challenge detection
    if (
      titleLower.includes("just a moment") ||
      titleLower.includes("checking your browser") ||
      titleLower.includes("please wait") ||
      urlLower.includes("cdn-cgi/challenge") ||
      urlLower.includes("cdn-cgi/l/chk_jschl")
    ) {
      logger.debug({ title, url: pageUrl }, "Cloudflare challenge detected");
      return { blocked: true, reason: "cloudflare_challenge" };
    }

    // Access denied detection
    if (
      titleLower.includes("access denied") ||
      titleLower.includes("403 forbidden") ||
      titleLower.includes("blocked")
    ) {
      logger.debug({ title, url: pageUrl }, "Access denied detected");
      return { blocked: true, reason: "access_denied" };
    }

    // Check body for Cloudflare or CAPTCHA markers
    let body = "";
    try {
      body = await page.content();
    } catch {
      return { blocked: false };
    }

    if (body.includes("challenge-platform") || body.includes("cf-browser-verification")) {
      logger.debug({ url: pageUrl }, "Cloudflare challenge marker found in body");
      return { blocked: true, reason: "cloudflare_challenge" };
    }

    if (body.includes("g-recaptcha") || body.includes("h-captcha") || body.includes("cf-turnstile")) {
      logger.debug({ url: pageUrl }, "CAPTCHA wall detected in body");
      return { blocked: true, reason: "captcha_wall" };
    }

    return { blocked: false };
  } catch (err) {
    logger.warn({ err }, "Block detection failed — assuming not blocked");
    return { blocked: false };
  }
}

export async function waitForChallenge(
  page: WaitablePage,
  options: Partial<WaitOptions> = {},
): Promise<BlockDetection> {
  const { maxWaitMs, pollIntervalMs } = { ...DEFAULT_WAIT_OPTIONS, ...options };

  const initial = await detectBlock(page);
  if (!initial.blocked) return initial;

  // Non-transient blocks (access_denied) — don't retry
  if (!TRANSIENT_REASONS.includes(initial.reason)) {
    return initial;
  }

  // Wait and retry for transient blocks (Cloudflare JS challenges)
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(pollIntervalMs);
    const check = await detectBlock(page);
    if (!check.blocked) return check;
  }

  return await detectBlock(page);
}
