import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { BrokerDatabaseSchema } from "../types/broker.js";
import type { BrokerDatabase } from "../types/broker.js";
import { ValidationError } from "../util/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BROKER_PATH = resolve(__dirname, "../../data/brokers.yaml");

export function loadBrokerDatabase(path?: string): BrokerDatabase {
  const brokerPath = path ?? DEFAULT_BROKER_PATH;

  let raw: unknown;
  try {
    const content = readFileSync(brokerPath, "utf-8");
    raw = yaml.load(content);
  } catch (err) {
    throw new ValidationError(`Failed to read broker database: ${brokerPath}`, err);
  }

  const result = BrokerDatabaseSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ValidationError(`Invalid broker database:\n${issues}`);
  }

  return result.data;
}
