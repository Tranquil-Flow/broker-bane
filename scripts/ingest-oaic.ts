#!/usr/bin/env tsx
/**
 * ingest-oaic.ts
 *
 * Downloads the Australian OAIC (Office of the Australian Information
 * Commissioner) data broker / APP entity list and merges new entries
 * into data/brokers.yaml. Existing entries (matched by domain) are
 * never overwritten.
 *
 * The OAIC publishes a list of entities covered by the Australian Privacy
 * Principles (APP) including data brokers. The source format is CSV.
 *
 * Usage: npx tsx scripts/ingest-oaic.ts [--dry-run] [--file <path>]
 *
 * Use --file to load from a local CSV instead of downloading.
 *
 * Expected CSV columns (0-indexed):
 *   0 - Entity name
 *   1 - Trading name / DBA
 *   2 - Website URL
 *   3 - Contact email
 *   4 - Type (data broker, credit reporting, etc.)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const BROKERS_PATH = resolve(ROOT, "data/brokers.yaml");

const OAIC_URL =
  "https://www.oaic.gov.au/about-us/our-regulatory-approach/data-broker-register/data-broker-register.csv";

// ─── Column indices ────────────────────────────────────────────────────────

const COL_NAME = 0;
const COL_DBA = 1;
const COL_WEBSITE = 2;
const COL_EMAIL = 3;
const COL_TYPE = 4;

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
  }
}

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      i++;
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(field.trim());
      field = "";
      i++;
      continue;
    }
    if (!inQuotes && (ch === "\n" || (ch === "\r" && text[i + 1] === "\n"))) {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
      i += ch === "\r" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field.trim() || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

function inferRemovalMethod(email: string, optOutUrl: string): string {
  if (email && optOutUrl) return "hybrid";
  if (optOutUrl) return "web_form";
  return "email";
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const fileIdx = process.argv.indexOf("--file");
  const localFile = fileIdx !== -1 ? process.argv[fileIdx + 1] : undefined;

  // Load existing brokers
  const existing = yaml.load(readFileSync(BROKERS_PATH, "utf-8")) as {
    version: string;
    updated: string;
    brokers: Record<string, unknown>[];
  };

  const existingDomains = new Set(
    existing.brokers.map((b) => (b.domain as string).toLowerCase())
  );
  const existingIds = new Set(
    existing.brokers.map((b) => b.id as string)
  );
  console.log(`Existing brokers: ${existing.brokers.length}`);

  // Load CSV
  let csvText: string;
  if (localFile) {
    if (!existsSync(localFile)) {
      throw new Error(`File not found: ${localFile}`);
    }
    console.log(`\nReading OAIC data from local file:\n  ${localFile}`);
    csvText = readFileSync(localFile, "utf-8");
  } else {
    console.log(`\nDownloading OAIC register from:\n  ${OAIC_URL}`);
    const response = await fetch(OAIC_URL);
    if (!response.ok) {
      throw new Error(`Failed to download OAIC register: ${response.status} ${response.statusText}`);
    }
    csvText = await response.text();
  }

  const rows = parseCsv(csvText);

  // Skip header row
  const dataRows = rows.slice(1).filter((r) => r[COL_WEBSITE]?.trim());
  console.log(`OAIC entities (with website): ${dataRows.length}`);

  // Convert and deduplicate
  const newBrokers: Record<string, unknown>[] = [];
  const skippedDomains: string[] = [];

  for (const row of dataRows) {
    const rawName = row[COL_NAME]?.trim() ?? "";
    const dba = row[COL_DBA]?.trim() ?? "";
    const website = row[COL_WEBSITE]?.trim() ?? "";
    const email = (row[COL_EMAIL]?.trim() ?? "").split(/[;,]/)[0].trim();
    const entityType = row[COL_TYPE]?.trim().toLowerCase() ?? "";

    if (!rawName || !website) continue;

    const domain = extractDomain(website);
    if (!domain) continue;

    if (existingDomains.has(domain)) {
      skippedDomains.push(domain);
      continue;
    }

    const name = dba && dba.length > 0 && dba.length < rawName.length ? dba : rawName;

    let id = generateId(name);
    let idSuffix = 2;
    while (existingIds.has(id)) {
      id = `${generateId(name)}_${idSuffix++}`;
    }
    existingIds.add(id);
    existingDomains.add(domain);

    // Categorize based on type field
    const category = entityType.includes("data broker")
      ? "data_broker"
      : entityType.includes("credit")
        ? "credit_bureau"
        : "data_broker";

    const removalMethod = inferRemovalMethod(email, "");

    const entry: Record<string, unknown> = {
      id,
      name: name.replace(/\s+/g, " ").trim(),
      domain,
      ...(email && { email }),
      region: "au",
      country: "au",
      category,
      removal_method: removalMethod,
      requires_captcha: false,
      requires_email_confirm: false,
      requires_id_upload: false,
      difficulty: "medium",
      tier: 3,
      public_directory: false,
      verify_before_send: false,
      status: "unverified",
    };

    newBrokers.push(entry);
  }

  console.log(`\nNew brokers to add: ${newBrokers.length}`);
  console.log(`Skipped (already have): ${skippedDomains.length}`);

  if (dryRun) {
    console.log("\n--dry-run: no changes written.");
    console.log("Sample new entries:");
    newBrokers.slice(0, 5).forEach((b) => {
      console.log(`  ${b.id} — ${b.domain} (${b.removal_method})`);
    });
    return;
  }

  if (newBrokers.length === 0) {
    console.log("\nNo new brokers to add.");
    return;
  }

  const merged = {
    ...existing,
    updated: new Date().toISOString().split("T")[0],
    brokers: [...existing.brokers, ...newBrokers],
  };

  writeFileSync(
    BROKERS_PATH,
    yaml.dump(merged, { lineWidth: 140, quotingType: '"' })
  );

  console.log(
    `\nWrote ${merged.brokers.length} total brokers to ${BROKERS_PATH}`
  );
  console.log(
    `  (${existing.brokers.length} existing + ${newBrokers.length} new from OAIC)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
