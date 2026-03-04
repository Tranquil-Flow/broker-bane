#!/usr/bin/env tsx
/**
 * ingest-justvanish.ts
 *
 * Clones the JustVanish repo (github.com/AnalogJ/justvanish), reads all
 * broker YAML files from data/organizations/, and merges new entries into
 * data/brokers.yaml.  Existing entries (matched by domain) are never overwritten.
 *
 * Usage: npx tsx scripts/ingest-justvanish.ts [--dry-run]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import yaml from "js-yaml";

const REPO_URL = "https://github.com/AnalogJ/justvanish.git";
const CLONE_DIR = resolve("/tmp/justvanish-import");
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

function inferRemovalMethod(emails: string[], forms: string[]): string {
  if (emails.length > 0 && forms.length > 0) return "hybrid";
  if (forms.length > 0) return "web_form";
  return "email";
}

interface JustVanishOrg {
  organization_name?: string;
  website?: string;
  organization_type?: string;
  regulation?: string | string[];
  contact?: {
    email?: Array<{ address?: string; usage?: string[] }>;
    form?: Array<{ url?: string; usage?: string[] }>;
    mail?: Array<{ address?: string; usage?: string[] }>;
  };
  notes?: string;
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

  // Clone JustVanish repo (shallow)
  if (existsSync(CLONE_DIR)) {
    rmSync(CLONE_DIR, { recursive: true, force: true });
  }
  console.log(`\nCloning JustVanish repo...`);
  execFileSync("git", ["clone", "--depth", "1", REPO_URL, CLONE_DIR], { stdio: "pipe" });

  const orgsDir = join(CLONE_DIR, "data", "organizations");
  if (!existsSync(orgsDir)) {
    throw new Error(`Organizations directory not found at ${orgsDir}`);
  }

  const yamlFiles = readdirSync(orgsDir).filter(
    (f) => f.endsWith(".yaml") || f.endsWith(".yml")
  );
  console.log(`JustVanish organization files: ${yamlFiles.length}`);

  // Process each org file
  const newBrokers: Record<string, unknown>[] = [];
  let skipped = 0;
  let noWebsite = 0;

  for (const file of yamlFiles) {
    let org: JustVanishOrg;
    try {
      org = yaml.load(readFileSync(join(orgsDir, file), "utf-8")) as JustVanishOrg;
    } catch {
      continue; // skip unparseable files
    }

    if (!org?.organization_name) continue;

    const website = org.website ?? "";
    const domain = extractDomain(website) || file.replace(/\.ya?ml$/, "").toLowerCase();

    if (!domain || domain.length < 3 || !domain.includes(".")) {
      noWebsite++;
      continue;
    }

    if (existingDomains.has(domain)) {
      skipped++;
      continue;
    }

    // Extract contact info
    const emails = (org.contact?.email ?? [])
      .map((e) => e.address ?? "")
      .filter(Boolean);
    const forms = (org.contact?.form ?? [])
      .map((f) => f.url ?? "")
      .filter(Boolean);

    const primaryEmail = emails[0] ?? "";
    const optOutUrl = forms[0] ?? "";
    const removalMethod = inferRemovalMethod(emails, forms);

    // Generate unique ID
    let id = generateId(org.organization_name);
    let idSuffix = 2;
    while (existingIds.has(id)) {
      id = `${generateId(org.organization_name)}_${idSuffix++}`;
    }
    existingIds.add(id);
    existingDomains.add(domain);

    const entry: Record<string, unknown> = {
      id,
      name: org.organization_name.replace(/\s+/g, " ").trim(),
      domain,
      ...(primaryEmail && { email: primaryEmail }),
      region: "us",
      category: org.organization_type === "agency" ? "government" : "data_broker",
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

  // Cleanup
  rmSync(CLONE_DIR, { recursive: true, force: true });

  console.log(`\nNew brokers to add: ${newBrokers.length}`);
  console.log(`Skipped (already have): ${skipped}`);
  console.log(`Skipped (no website/domain): ${noWebsite}`);

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
    `  (${existing.brokers.length} existing + ${newBrokers.length} new from JustVanish)`
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
