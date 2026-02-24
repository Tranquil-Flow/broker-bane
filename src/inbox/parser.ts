import { createHash } from "node:crypto";
import type { Broker } from "../types/broker.js";
import { doDomainsMatch, getRegistrableDomain } from "../util/domain.js";
import { logger } from "../util/logger.js";

export interface ParsedEmail {
  from: string;
  subject: string;
  bodyHash: string;
  confirmationUrls: string[];
  brokerMatch?: Broker;
}

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

export function hashEmailBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function extractUrls(htmlBody: string): string[] {
  const matches = htmlBody.match(URL_REGEX);
  if (!matches) return [];

  // Deduplicate and filter obvious non-confirmation URLs
  const unique = [...new Set(matches)];
  return unique.filter((url) => {
    // Skip common non-confirmation URLs
    const lower = url.toLowerCase();
    if (lower.includes("unsubscribe")) return false;
    if (lower.includes("privacy-policy")) return false;
    if (lower.includes("terms-of-service")) return false;
    if (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".gif")) return false;
    if (lower.endsWith(".css") || lower.endsWith(".js")) return false;
    return true;
  });
}

export function matchEmailToBroker(
  fromAddress: string,
  brokers: readonly Broker[]
): Broker | undefined {
  // First try confirm_sender_pattern match
  for (const broker of brokers) {
    if (broker.confirm_sender_pattern) {
      if (fromAddress.toLowerCase().includes(broker.confirm_sender_pattern.toLowerCase())) {
        return broker;
      }
    }
  }

  // Fall back to domain matching via tldts
  for (const broker of brokers) {
    const emailDomain = fromAddress.split("@")[1];
    if (emailDomain && doDomainsMatch(emailDomain, broker.domain)) {
      return broker;
    }
  }

  return undefined;
}

export function parseConfirmationEmail(
  from: string,
  subject: string,
  body: string,
  brokers: readonly Broker[]
): ParsedEmail {
  const bodyHash = hashEmailBody(body);
  const confirmationUrls = extractUrls(body);
  const brokerMatch = matchEmailToBroker(from, brokers);

  if (brokerMatch) {
    logger.info(
      { from, brokerId: brokerMatch.id, urlCount: confirmationUrls.length },
      "Matched email to broker"
    );
  }

  return { from, subject, bodyHash, confirmationUrls, brokerMatch };
}
