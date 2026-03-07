#!/usr/bin/env tsx
/**
 * ingest-ico.ts
 *
 * Downloads the UK ICO (Information Commissioner's Office) Data Protection
 * Register and merges data broker entries into data/brokers.yaml. Existing
 * entries (matched by domain) are never overwritten.
 *
 * The ICO publishes a register of data controllers. We filter for entries
 * likely to be data brokers based on their registered processing purposes.
 *
 * Usage: npx tsx scripts/ingest-ico.ts [--dry-run] [--file <path>]
 *
 * Use --file to load from a local CSV instead of downloading.
 *
 * Expected CSV columns (0-indexed):
 *   0 - Registration number
 *   1 - Organisation name
 *   2 - Trading name
 *   3 - Address
 *   4 - Website
 *   5 - Contact email
 *   6 - Processing purposes / nature of work
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const BROKERS_PATH = resolve(ROOT, "data/brokers.yaml");

const ICO_URL =
  "https://ico.org.uk/media/about-the-ico/documents/register-download.csv";

// ─── Column indices ────────────────────────────────────────────────────────

const COL_NAME = 1;
const COL_DBA = 2;
const COL_WEBSITE = 4;
const COL_EMAIL = 5;
const COL_PURPOSES = 6;

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

/** Check if an ICO entry is likely a data broker by its processing purposes. */
function isLikelyDataBroker(purposes: string): boolean {
  const lower = purposes.toLowerCase();
  const brokerTerms = [
    "trading in personal information",
    "data broker",
    "tracing",
    "people tracing",
    "direct marketing",
    "consumer profiling",
    "credit reference",
    "data matching",
    "debt collection",
    "skip tracing",
  ];
  return brokerTerms.some((term) => lower.includes(term));
}

function inferRemovalMethod(email: string): string {
  return email ? "email" : "web_form";
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
    console.log(`\nReading ICO data from local file:\n  ${localFile}`);
    csvText = readFileSync(localFile, "utf-8");
  } else {
    console.log(`\nDownloading ICO register from:\n  ${ICO_URL}`);
    const response = await fetch(ICO_URL);
    if (!response.ok) {
      throw new Error(`Failed to download ICO register: ${response.status} ${response.statusText}`);
    }
    csvText = await response.text();
  }

  const rows = parseCsv(csvText);

  // Skip header row, filter to entries with a website
  const dataRows = rows.slice(1).filter((r) => r[COL_WEBSITE]?.trim());
  console.log(`ICO entities (with website): ${dataRows.length}`);

  // Filter to likely data brokers and convert
  const newBrokers: Record<string, unknown>[] = [];
  const skippedDomains: string[] = [];
  let filteredOut = 0;

  for (const row of dataRows) {
    const purposes = row[COL_PURPOSES]?.trim() ?? "";

    // Only include entities whose processing purposes indicate data brokerage
    if (!isLikelyDataBroker(purposes)) {
      filteredOut++;
      continue;
    }

    const rawName = row[COL_NAME]?.trim() ?? "";
    const dba = row[COL_DBA]?.trim() ?? "";
    const website = row[COL_WEBSITE]?.trim() ?? "";
    const email = (row[COL_EMAIL]?.trim() ?? "").split(/[;,]/)[0].trim();

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

    const category = purposes.toLowerCase().includes("credit reference")
      ? "credit_bureau"
      : "data_broker";

    const removalMethod = inferRemovalMethod(email);

    const entry: Record<string, unknown> = {
      id,
      name: name.replace(/\s+/g, " ").trim(),
      domain,
      ...(email && { email }),
      region: "gb",
      country: "gb",
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

  console.log(`\nFiltered out (not data brokers): ${filteredOut}`);
  console.log(`New brokers to add: ${newBrokers.length}`);
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
    `  (${existing.brokers.length} existing + ${newBrokers.length} new from ICO)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
