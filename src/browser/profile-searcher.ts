import type { StagehandInstance } from "./session.js";
import type { Broker } from "../types/broker.js";
import type { Profile } from "../types/config.js";
import { captureScreenshot } from "./screenshot.js";
import { logger } from "../util/logger.js";

export interface SearchResult {
  found: boolean;
  profileData?: Record<string, string>;
  screenshotPath?: string;
  confidence: number;
}

export async function searchBrokerForProfile(
  browser: StagehandInstance,
  broker: Broker,
  profile: Profile,
  options: { screenshotDir?: string; timeoutMs?: number } = {}
): Promise<SearchResult> {
  const { timeoutMs = 30_000 } = options;

  if (!broker.search_url) {
    logger.debug({ brokerId: broker.id }, "No search URL, skipping profile search");
    return { found: false, confidence: 0 };
  }

  try {
    await Promise.race([
      browser.page.goto(broker.search_url),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Navigation timeout")), timeoutMs)
      ),
    ]);

    // Search for the user
    const searchInstruction = `Search for a person named ${profile.first_name} ${profile.last_name}` +
      (profile.city ? ` in ${profile.city}, ${profile.state}` : "");

    await browser.page.act(searchInstruction);

    // Extract results
    const extractInstruction =
      `Look at the search results. Find any profile that matches the name "${profile.first_name} ${profile.last_name}".` +
      ` Extract the person's name, city, state, age, and any other visible details as key-value pairs.`;

    const data = await browser.page.extract(extractInstruction) as Record<string, string> | null;

    const screenshotPath = await captureScreenshot(
      browser,
      broker.id,
      "search",
      options.screenshotDir
    );

    if (data && Object.keys(data).length > 0) {
      logger.info({ brokerId: broker.id }, "Profile found on broker site");
      return { found: true, profileData: data, screenshotPath, confidence: 50 };
    }

    return { found: false, screenshotPath, confidence: 0 };
  } catch (err) {
    logger.warn({ brokerId: broker.id, err }, "Profile search failed");
    return { found: false, confidence: 0 };
  }
}
