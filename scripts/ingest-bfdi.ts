#!/usr/bin/env tsx
/**
 * ingest-bfdi.ts
 *
 * Downloads the Germany BfDI (Bundesbeauftragter für den Datenschutz und
 * die Informationsfreiheit) register of data processors and merges data
 * broker entries into data/brokers.yaml.
 *
 * Usage: npx tsx scripts/ingest-bfdi.ts [--dry-run] [--file <path>]
 *
 * Use --file to load from a local CSV instead of downloading.
 *
 * Expected CSV columns (0-indexed):
 *   0 - Organization name
 *   1 - Website URL
 *   2 - Contact email
 *   3 - Data protection officer email
 *   4 - Processing category
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const BROKERS_PATH = resolve(ROOT, "data/brokers.yaml");

const BFDI_URL =
  "https://www.bfdi.bund.de/SharedDocs/Downloads/DE/Register/Verarbeitungsverzeichnis-Export.csv";

const COL_NAME = 0;
const COL_WEBSITE = 1;
const COL_EMAIL = 2;
const COL_CATEGORY = 4;

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

/** Check if a BfDI entry is likely a data broker by its category. */
function isLikelyDataBroker(category: string): boolean {
  const lower = category.toLowerCase();
  const brokerTerms = [
    "datenhändler",
    "datenhandel",
    "data broker",
    "adresshandel",
    "auskunftei",
    "bonitätsprüfung",
    "scoring",
    "direktmarketing",
    "adressverlag",
    "personensuche",
    "wirtschaftsauskunft",
    "inkasso",
  ];
  return brokerTerms.some((term) => lower.includes(term));
}

function inferRemovalMethod(email: string): string {
  return email ? "email" : "web_form";
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const fileIdx = process.argv.indexOf("--file");
  const localFile = fileIdx !== -1 ? process.argv[fileIdx + 1] : undefined;

  const existing = yaml.load(readFileSync(BROKERS_PATH, "utf-8")) as {
    version: string;
    updated: string;
    brokers: Record<string, unknown>[];
  };

  const existingDomains = new Set(
    existing.brokers.map((b) => (b.domain as string).toLowerCase())
  );
  const existingIds = new Set(existing.brokers.map((b) => b.id as string));
  console.log(`Existing brokers: ${existing.brokers.length}`);

  let csvText: string;
  if (localFile) {
    if (!existsSync(localFile)) {
      throw new Error(`File not found: ${localFile}`);
    }
    console.log(`\nReading BfDI data from local file:\n  ${localFile}`);
    csvText = readFileSync(localFile, "utf-8");
  } else {
    console.log(`\nDownloading BfDI register from:\n  ${BFDI_URL}`);
    const response = await fetch(BFDI_URL);
    if (!response.ok) {
      throw new Error(`Failed to download BfDI register: ${response.status} ${response.statusText}`);
    }
    csvText = await response.text();
  }

  const rows = parseCsv(csvText);
  const dataRows = rows.slice(1).filter((r) => r[COL_WEBSITE]?.trim());
  console.log(`BfDI entities (with website): ${dataRows.length}`);

  const newBrokers: Record<string, unknown>[] = [];
  const skippedDomains: string[] = [];
  let filteredOut = 0;

  for (const row of dataRows) {
    const category = row[COL_CATEGORY]?.trim() ?? "";

    if (!isLikelyDataBroker(category)) {
      filteredOut++;
      continue;
    }

    const rawName = row[COL_NAME]?.trim() ?? "";
    const website = row[COL_WEBSITE]?.trim() ?? "";
    const email = (row[COL_EMAIL]?.trim() ?? "").split(/[;,]/)[0].trim();

    if (!rawName || !website) continue;

    const domain = extractDomain(website);
    if (!domain) continue;

    if (existingDomains.has(domain)) {
      skippedDomains.push(domain);
      continue;
    }

    let id = generateId(rawName);
    let idSuffix = 2;
    while (existingIds.has(id)) {
      id = `${generateId(rawName)}_${idSuffix++}`;
    }
    existingIds.add(id);
    existingDomains.add(domain);

    const brokerCategory = category.toLowerCase().includes("auskunftei") ||
      category.toLowerCase().includes("bonitätsprüfung")
      ? "credit_bureau"
      : "data_broker";

    const entry: Record<string, unknown> = {
      id,
      name: rawName.replace(/\s+/g, " ").trim(),
      domain,
      ...(email && { email }),
      region: "eu",
      country: "de",
      category: brokerCategory,
      removal_method: inferRemovalMethod(email),
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

  console.log(`\nWrote ${merged.brokers.length} total brokers to ${BROKERS_PATH}`);
  console.log(`  (${existing.brokers.length} existing + ${newBrokers.length} new from BfDI)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
