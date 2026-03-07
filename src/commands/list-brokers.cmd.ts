import { loadBrokerDatabase } from "../data/broker-loader.js";
import { BrokerStore } from "../data/broker-store.js";
import type { Region, RemovalMethod } from "../types/broker.js";

export async function listBrokersCommand(options: {
  region?: string;
  country?: string;
  tier?: string;
  method?: string;
  search?: string;
  format?: string;
}): Promise<void> {
  const db = loadBrokerDatabase();
  const store = new BrokerStore(db.brokers);

  let brokers;

  if (options.search) {
    brokers = store.search(options.search);
  } else {
    brokers = store.filter({
      regions: options.region ? [options.region as Region] : undefined,
      country: options.country?.toLowerCase(),
      tiers: options.tier ? [parseInt(options.tier, 10)] : undefined,
      methods: options.method ? [options.method as RemovalMethod] : undefined,
    });
  }

  if (options.format === "json") {
    console.log(JSON.stringify(brokers, null, 2));
    return;
  }

  console.log(`\nFound ${brokers.length} brokers:\n`);
  console.log(
    "ID".padEnd(25) +
      "Name".padEnd(25) +
      "Method".padEnd(12) +
      "Tier".padEnd(6) +
      "Difficulty"
  );
  console.log("-".repeat(78));

  for (const b of brokers) {
    console.log(
      b.id.padEnd(25) +
        b.name.padEnd(25) +
        b.removal_method.padEnd(12) +
        String(b.tier).padEnd(6) +
        b.difficulty
    );
  }
  console.log();
}
