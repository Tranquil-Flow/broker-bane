import type { StagehandInstance } from "../browser/session.js";
import { logger } from "../util/logger.js";

export const CAPTCHA_TYPE = {
  recaptcha_v2: "recaptcha_v2",
  recaptcha_v3: "recaptcha_v3",
  hcaptcha: "hcaptcha",
  turnstile: "turnstile",
  unknown: "unknown",
  none: "none",
} as const;

export type CaptchaType = (typeof CAPTCHA_TYPE)[keyof typeof CAPTCHA_TYPE];

export interface CaptchaDetection {
  type: CaptchaType;
  siteKey?: string;
}

export async function detectCaptcha(
  browser: StagehandInstance
): Promise<CaptchaDetection> {
  try {
    const result = await browser.page.extract(
      "Check if there is a CAPTCHA on this page. " +
        "Look for reCAPTCHA, hCaptcha, or Cloudflare Turnstile widgets. " +
        "Return the type of CAPTCHA found (recaptcha_v2, recaptcha_v3, hcaptcha, turnstile, or none) " +
        "and any site key or data-sitekey attribute value."
    ) as { type?: string; siteKey?: string } | null;

    if (!result || result.type === "none") {
      return { type: CAPTCHA_TYPE.none };
    }

    const typeMap: Record<string, CaptchaType> = {
      recaptcha_v2: CAPTCHA_TYPE.recaptcha_v2,
      recaptcha_v3: CAPTCHA_TYPE.recaptcha_v3,
      hcaptcha: CAPTCHA_TYPE.hcaptcha,
      turnstile: CAPTCHA_TYPE.turnstile,
    };

    const captchaType = typeMap[result.type ?? ""] ?? CAPTCHA_TYPE.unknown;
    logger.info({ captchaType, siteKey: result.siteKey }, "CAPTCHA detected");

    return { type: captchaType, siteKey: result.siteKey };
  } catch (err) {
    logger.warn({ err }, "CAPTCHA detection failed");
    return { type: CAPTCHA_TYPE.unknown };
  }
}
