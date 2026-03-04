// src/playbook/loader.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { PlaybookSchema, type Playbook } from "./schema.js";
import { ValidationError } from "../util/errors.js";

export function loadPlaybook(filePath: string): Playbook {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = yaml.load(raw);
  const result = PlaybookSchema.safeParse(parsed);

  if (!result.success) {
    throw new ValidationError(
      `Invalid playbook at ${filePath}: ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return result.data;
}

export function loadAllPlaybooks(dir: string): Map<string, Playbook> {
  const map = new Map<string, Playbook>();

  if (!existsSync(dir)) return map;

  const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));

  for (const file of files) {
    try {
      const playbook = loadPlaybook(join(dir, file));
      map.set(playbook.broker_id, playbook);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`Skipping invalid playbook ${file}: ${message}`);
    }
  }

  return map;
}
