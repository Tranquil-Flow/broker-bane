import { doDomainsMatch, isUrlShortener, isHttps, getRegistrableDomain } from "../util/domain.js";
import { LinkValidationError } from "../util/errors.js";

export interface LinkValidationResult {
  safe: boolean;
  url: string;
  reason?: string;
}

export function validateConfirmationLink(
  url: string,
  brokerDomain: string
): LinkValidationResult {
  // Must be HTTPS
  if (!isHttps(url)) {
    return { safe: false, url, reason: "URL is not HTTPS" };
  }

  // Block URL shorteners
  if (isUrlShortener(url)) {
    return { safe: false, url, reason: "URL shortener detected" };
  }

  // Domain must match broker's registrable domain
  // CRITICAL: Uses tldts getDomain(), NEVER endsWith()
  if (!doDomainsMatch(url, brokerDomain)) {
    const urlDomain = getRegistrableDomain(url);
    return {
      safe: false,
      url,
      reason: `Domain mismatch: ${urlDomain} does not match ${brokerDomain}`,
    };
  }

  return { safe: true, url };
}

export function assertLinkSafe(url: string, brokerDomain: string): void {
  const result = validateConfirmationLink(url, brokerDomain);
  if (!result.safe) {
    throw new LinkValidationError(url, result.reason ?? "Unknown safety issue");
  }
}
