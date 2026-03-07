#!/usr/bin/env tsx
/**
 * Reads scripts/data/people-search-sources.yaml and merges new entries
 * into data/brokers.yaml. Deduplicates by domain so re-running is safe.
 *
 * Usage: npx tsx scripts/ingest-people-search.ts [--dry-run]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const ROOT = resolve(import.meta.dirname ?? __dirname, "..");
const BROKERS_PATH = resolve(ROOT, "data/brokers.yaml");
const SOURCE_PATHS = [
  resolve(ROOT, "scripts/data/people-search-sources.yaml"),
  resolve(ROOT, "scripts/data/people-search-expansion.yaml"),
];

interface SourceSubsidiary {
  name: string;
  domain: string;
  region?: string;
  country?: string;
  search_url?: string;
  opt_out_url?: string;
}

interface SourceParentCompany {
  name: string;
  subsidiaries: SourceSubsidiary[];
}

interface SourceFile {
  parent_companies: SourceParentCompany[];
}

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  const existing = yaml.load(readFileSync(BROKERS_PATH, "utf-8")) as {
    version: string;
    updated: string;
    brokers: Record<string, unknown>[];
  };

  const existingDomains = new Set(
    existing.brokers.map((b) => (b.domain as string).toLowerCase().replace(/^www\./, ""))
  );
  const existingIds = new Set(existing.brokers.map((b) => b.id as string));
  console.log(`Existing brokers: ${existing.brokers.length}`);

  const allParentCompanies: SourceParentCompany[] = [];
  for (const sourcePath of SOURCE_PATHS) {
    try {
      console.log(`\nReading sources from:\n  ${sourcePath}`);
      const sources = yaml.load(readFileSync(sourcePath, "utf-8")) as SourceFile;
      if (sources?.parent_companies?.length) {
        allParentCompanies.push(...sources.parent_companies);
        const subs = sources.parent_companies.reduce((sum, pc) => sum + (pc.subsidiaries?.length ?? 0), 0);
        console.log(`  ${sources.parent_companies.length} parent companies, ${subs} subsidiaries`);
      }
    } catch (err) {
      console.log(`  Skipping (not found or invalid): ${sourcePath}`);
    }
  }

  if (allParentCompanies.length === 0) {
    throw new Error("No valid source files found");
  }

  const newBrokers: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const parentCompany of allParentCompanies) {
    const subsidiaries = parentCompany.subsidiaries ?? [];
    let firstSubsidiaryId: string | undefined;

    for (let i = 0; i < subsidiaries.length; i++) {
      const sub = subsidiaries[i];
      if (!sub.name || !sub.domain) continue;

      const domain = sub.domain.toLowerCase().replace(/^www\./, "");

      if (existingDomains.has(domain)) {
        skipped++;
        continue;
      }

      let id = generateId(sub.name);
      let idSuffix = 2;
      while (existingIds.has(id)) {
        id = `${generateId(sub.name)}-${idSuffix++}`;
      }
      existingIds.add(id);
      existingDomains.add(domain);

      if (firstSubsidiaryId === undefined) {
        firstSubsidiaryId = id;
      }

      const entry: Record<string, unknown> = {
        id,
        name: sub.name.replace(/\s+/g, " ").trim(),
        domain,
        region: sub.region ?? "us",
        category: "people_search",
        removal_method: "web_form",
        requires_captcha: false,
        requires_email_confirm: false,
        requires_id_upload: false,
        difficulty: "medium",
        opt_out_validity_days: 180,
        tier: 3,
        public_directory: true,
        verify_before_send: true,
        parent_company: parentCompany.name,
      };

      if (i > 0 && firstSubsidiaryId !== id) {
        entry.subsidiary_of = firstSubsidiaryId;
      }
      if (sub.country) entry.country = sub.country;
      if (sub.search_url) entry.search_url = sub.search_url;
      if (sub.opt_out_url) entry.opt_out_url = sub.opt_out_url;

      newBrokers.push(entry);
    }
  }

  console.log(`\nNew brokers to add: ${newBrokers.length}`);
  console.log(`Skipped (already exist): ${skipped}`);

  if (dryRun) {
    console.log("\n--dry-run: no changes written.");
    if (newBrokers.length > 0) {
      console.log("Sample new entries:");
      for (const b of newBrokers.slice(0, 10)) {
        console.log(`  ${b.id} — ${b.domain} [${b.parent_company}]`);
      }
    }
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
  console.log(`  (${existing.brokers.length} existing + ${newBrokers.length} new)`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
