#!/usr/bin/env tsx
/**
 * ingest-cppa.ts
 *
 * Downloads the California CPPA Data Broker Registry CSV and merges new
 * entries into data/brokers.yaml.  Existing entries (matched by domain)
 * are never overwritten.
 *
 * Usage: npx tsx scripts/ingest-cppa.ts [--dry-run]
 *
 * CPPA CSV source: https://cppa.ca.gov/data_broker_registry/registry.csv
 * Row 0  = internal notes (skip)
 * Row 1  = column headers
 * Row 2+ = broker data
 *
 * Relevant columns (0-indexed):
 *   0  - Data broker name
 *   1  - DBA (doing business as)
 *   2  - Primary website
 *   3  - Primary contact email
 *  14  - Privacy rights / opt-out URL
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const CPPA_URL =
  "https://cppa.ca.gov/data_broker_registry/registry.csv";
const BROKERS_PATH = resolve("data/brokers.yaml");

// ─── Column indices ────────────────────────────────────────────────────────

const COL_NAME = 0;
const COL_DBA = 1;
const COL_WEBSITE = 2;
const COL_EMAIL = 3;
const COL_OPT_OUT = 14;

// ─── Helpers ───────────────────────────────────────────────────────────────

function extractDomain(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url.trim());
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    // Fallback: strip protocol and www manually
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

/** Minimal CSV parser — handles quoted fields with embedded commas/newlines. */
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
  console.log(`Existing domains: ${existingDomains.size}`);

  // Download CPPA CSV
  console.log(`\nDownloading CPPA registry from:\n  ${CPPA_URL}`);
  const response = await fetch(CPPA_URL);
  if (!response.ok) {
    throw new Error(`Failed to download CPPA registry: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  const rows = parseCsv(csvText);

  // Row 0 = internal notes, Row 1 = header, Row 2+ = data
  const dataRows = rows.slice(2).filter((r) => r[COL_WEBSITE]?.trim());
  console.log(`CPPA brokers (with website): ${dataRows.length}`);

  // Convert and deduplicate
  const newBrokers: Record<string, unknown>[] = [];
  const skippedDomains: string[] = [];

  for (const row of dataRows) {
    const rawName = row[COL_NAME]?.trim() ?? "";
    const dba = row[COL_DBA]?.trim() ?? "";
    const website = row[COL_WEBSITE]?.trim() ?? "";
    // Some CPPA entries list multiple addresses separated by ";" — take only the first
    const email = (row[COL_EMAIL]?.trim() ?? "").split(/[;,]/)[0].trim();
    const optOutUrl = row[COL_OPT_OUT]?.trim() ?? "";

    if (!rawName || !website) continue;

    const domain = extractDomain(website);
    if (!domain) continue;

    // Skip if we already have this broker
    if (existingDomains.has(domain)) {
      skippedDomains.push(domain);
      continue;
    }

    // Build display name (prefer DBA if it's shorter/cleaner)
    const name =
      dba && dba.length > 0 && dba.length < rawName.length ? dba : rawName;

    // Generate a unique ID
    let id = generateId(name);
    let idSuffix = 2;
    while (existingIds.has(id)) {
      id = `${generateId(name)}_${idSuffix++}`;
    }
    existingIds.add(id);
    existingDomains.add(domain);

    const removalMethod = inferRemovalMethod(email, optOutUrl);

    const entry: Record<string, unknown> = {
      id,
      name: name.replace(/\s+/g, " ").trim(),
      domain,
      ...(email && { email }),
      region: "us",
      category: "data_broker",
      removal_method: removalMethod,
      requires_captcha: false,
      requires_email_confirm: false,
      requires_id_upload: false,
      difficulty: "medium",
      tier: 3,
      public_directory: false,
      verify_before_send: false,
      status: "unverified",
      ...(optOutUrl && { opt_out_url: optOutUrl }),
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

  // Merge
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
    `\n✓ Wrote ${merged.brokers.length} total brokers to ${BROKERS_PATH}`
  );
  console.log(
    `  (${existing.brokers.length} existing + ${newBrokers.length} new from CPPA)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
