import { validateConfirmationLink } from "./link-validator.js";
import type { Broker } from "../types/broker.js";
import { logger } from "../util/logger.js";

export interface ConfirmResult {
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
}

export async function clickConfirmationLink(
  url: string,
  broker: Broker
): Promise<ConfirmResult> {
  // Validate link safety first
  const validation = validateConfirmationLink(url, broker.domain);
  if (!validation.safe) {
    logger.warn(
      { url, reason: validation.reason, brokerId: broker.id },
      "Rejected unsafe confirmation link"
    );
    return {
      url,
      success: false,
      error: `Link rejected: ${validation.reason}`,
    };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BrokerBane/1.0)",
      },
    });

    const success = response.ok;
    logger.info(
      { url, statusCode: response.status, brokerId: broker.id },
      success ? "Confirmation link clicked" : "Confirmation link returned error"
    );

    return {
      url,
      success,
      statusCode: response.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ url, err: message, brokerId: broker.id }, "Failed to click confirmation link");
    return {
      url,
      success: false,
      error: message,
    };
  }
}
