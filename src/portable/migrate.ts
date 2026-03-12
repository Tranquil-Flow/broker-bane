// src/portable/migrate.ts
// No Node.js imports
import type { PortablePayload } from "./schema.js";

const CURRENT_VERSION = 1;

export function migrate(payload: unknown, fromVersion: number): PortablePayload {
  if (fromVersion >= CURRENT_VERSION) return payload as PortablePayload;
  // Future: add v1ToV2(), v2ToV3() etc.
  throw new Error(
    `Cannot migrate from format version ${fromVersion} — update BrokerBane to the latest version`
  );
}
