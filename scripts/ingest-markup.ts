#!/usr/bin/env tsx
/**
 * ingest-markup.ts
 *
 * Downloads The Markup's data-broker-opt-out-pages dataset from GitHub and
 * merges new entries into data/brokers.yaml. This dataset contains ~500
 * CPPA-registered brokers with tested opt-out URLs and metadata about
 * whether brokers collect minor/location/reproductive data.
 *
 * Usage: npx tsx scripts/ingest-markup.ts [--dry-run]
 *
 * Source: github.com/the-markup/investigation-data-broker-opt-out-pages
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const CSV_URL =
  "https://raw.githubusercontent.com/the-markup/investigation-data-broker-opt-out-pages/main/data/data-broker-opt-out-pages.csv";
const BROKERS_PATH = resolve("data/brokers.yaml");

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

  // Download The Markup CSV
  console.log(`\nDownloading The Markup dataset from:\n  ${CSV_URL}`);
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  const rows = parseCsv(csvText);

  if (rows.length < 2) {
    throw new Error("CSV appears empty or malformed");
  }

  // Build header index
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const col = (name: string) => headers.indexOf(name);

  const iName = col("company_name");
  const iHostname = col("hostname_original");
  const iOptOutUrl = col("url_original");
  const iOptOutFinal = col("url_final");
  const iMinors = col("collects_minors_data");
  const iLocation = col("collects_location_data");
  const iRepro = col("collects_reproductive_data");

  if (iName === -1 || iHostname === -1) {
    console.log("Available columns:", headers.join(", "));
    throw new Error("Could not find required columns (company_name, hostname_original)");
  }

  const dataRows = rows.slice(1).filter((r) => r[iName]?.trim());
  console.log(`The Markup brokers: ${dataRows.length}`);

  // Convert and deduplicate
  const newBrokers: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of dataRows) {
    const name = row[iName]?.trim() ?? "";
    const hostname = row[iHostname]?.trim() ?? "";
    const optOutUrl = (iOptOutFinal !== -1 ? row[iOptOutFinal]?.trim() : "") || row[iOptOutUrl]?.trim() || "";

    if (!name) continue;

    const domain = extractDomain(hostname) || extractDomain(name);
    if (!domain || domain.length < 3) continue;

    if (existingDomains.has(domain)) {
      skipped++;
      continue;
    }

    let id = generateId(name);
    let idSuffix = 2;
    while (existingIds.has(id)) {
      id = `${generateId(name)}_${idSuffix++}`;
    }
    existingIds.add(id);
    existingDomains.add(domain);

    const entry: Record<string, unknown> = {
      id,
      name: name.replace(/\s+/g, " ").trim(),
      domain,
      region: "us",
      category: "data_broker",
      removal_method: optOutUrl ? "web_form" : "email",
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

    // Add metadata flags if available
    if (iMinors !== -1 && row[iMinors]?.trim().toLowerCase() === "true") {
      entry.collects_minors_data = true;
    }
    if (iLocation !== -1 && row[iLocation]?.trim().toLowerCase() === "true") {
      entry.collects_location_data = true;
    }
    if (iRepro !== -1 && row[iRepro]?.trim().toLowerCase() === "true") {
      entry.collects_reproductive_data = true;
    }

    newBrokers.push(entry);
  }

  console.log(`\nNew brokers to add: ${newBrokers.length}`);
  console.log(`Skipped (already have): ${skipped}`);

  if (dryRun) {
    console.log("\n--dry-run: no changes written.");
    console.log("Sample new entries:");
    newBrokers.slice(0, 10).forEach((b) => {
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
    `\n✓ Wrote ${merged.brokers.length} total brokers to ${BROKERS_PATH}`
  );
  console.log(
    `  (${existing.brokers.length} existing + ${newBrokers.length} new from The Markup)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
