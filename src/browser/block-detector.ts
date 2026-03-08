export interface BlockDetection {
  blocked: boolean;
  reason?: "cloudflare_challenge" | "access_denied" | "captcha_wall";
}

interface PageLike {
  title(): Promise<string>;
  url(): string;
  content(): Promise<string>;
}

const CLOUDFLARE_TITLES = ["just a moment", "checking your browser"];
const ACCESS_DENIED_TITLES = ["access denied", "sorry, you have been blocked", "403 forbidden"];
const CAPTCHA_WALL_TITLES = ["attention required"];

const CLOUDFLARE_URL_PATHS = ["/cdn-cgi/challenge", "/cdn-cgi/l/chk_jschl"];
const CLOUDFLARE_BODY_MARKERS = ["challenge-platform", "cf-browser-verification", "cf-challenge-running"];

export async function detectBlock(page: PageLike): Promise<BlockDetection> {
  const title = (await page.title()).toLowerCase();
  const url = page.url();

  // Check title-based signals
  if (CLOUDFLARE_TITLES.some((t) => title.includes(t))) {
    return { blocked: true, reason: "cloudflare_challenge" };
  }
  if (ACCESS_DENIED_TITLES.some((t) => title.includes(t))) {
    return { blocked: true, reason: "access_denied" };
  }
  if (CAPTCHA_WALL_TITLES.some((t) => title.includes(t))) {
    return { blocked: true, reason: "captcha_wall" };
  }

  // Check URL-based signals
  if (CLOUDFLARE_URL_PATHS.some((p) => url.includes(p))) {
    return { blocked: true, reason: "cloudflare_challenge" };
  }

  // Check body content (only if title/URL didn't match — avoids reading full DOM unnecessarily)
  try {
    const body = await page.content();
    if (CLOUDFLARE_BODY_MARKERS.some((m) => body.includes(m))) {
      return { blocked: true, reason: "cloudflare_challenge" };
    }
  } catch {
    // If content() fails, don't count as blocked
  }

  return { blocked: false };
}
