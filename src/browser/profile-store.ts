import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../util/logger.js";

export interface StorageState {
  cookies: Array<Record<string, unknown>>;
  origins: Array<Record<string, unknown>>;
}

export class BrowserProfileStore {
  constructor(private readonly profileDir: string) {
    mkdirSync(this.profileDir, { recursive: true });
  }

  private filePath(domain: string): string {
    const safe = domain.replace(/[^a-zA-Z0-9.\-]/g, "_");
    return join(this.profileDir, `${safe}.json`);
  }

  load(domain: string): StorageState | null {
    const path = this.filePath(domain);
    if (!existsSync(path)) return null;

    try {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content) as StorageState;
    } catch (err) {
      logger.warn({ domain, err }, "Failed to load browser profile");
      return null;
    }
  }

  save(domain: string, state: StorageState): void {
    const path = this.filePath(domain);
    try {
      writeFileSync(path, JSON.stringify(state, null, 2), {
        encoding: "utf-8",
        mode: 0o600,
      });
      logger.debug({ domain }, "Saved browser profile");
    } catch (err) {
      logger.warn({ domain, err }, "Failed to save browser profile");
    }
  }
}
