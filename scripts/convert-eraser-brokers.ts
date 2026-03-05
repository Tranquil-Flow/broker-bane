#!/usr/bin/env tsx
/**
 * convert-eraser-brokers.ts
 *
 * Merges Eraser's 764 broker database into BrokerBane's brokers.yaml.
 * (https://github.com/nicholasgasior/eraser)
 *
 * Eraser's broker YAML fields:
 *   - id, name, website, email, region, category, opt_out_url
 *
 * BrokerBane extends with:
 *   - domain (extracted from website), removal_method, requires_captcha,
 *     requires_email_confirm, requires_id_upload, difficulty, tier, status,
 *     public_directory, verify_before_send
 *
 * Usage: npx tsx scripts/convert-eraser-brokers.ts <eraser-brokers.yaml>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

interface EraserBroker {
  id?: string;
  name: string;
  website?: string;
  email?: string;
  region?: string;
  category?: string;
  privacy_policy_url?: string;
  opt_out_url?: string;
}

function generateId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function extractDomain(website: string | undefined): string | undefined {
  if (!website) return undefined;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

function normalizeCategory(category: string | undefined): string {
  if (!category) return "data_broker";
  return category.replace(/-/g, "_");
}

function inferRemovalMethod(broker: EraserBroker): string {
  if (broker.opt_out_url && broker.email) return "hybrid";
  if (broker.opt_out_url) return "web_form";
  return "email";
}

function convert(inputPath: string, outputPath: string): void {
  const raw = readFileSync(inputPath, "utf-8");
  const data = yaml.load(raw) as { brokers?: EraserBroker[] };

  if (!data?.brokers) {
    console.error("No brokers found in input file");
    process.exit(1);
  }

  // Load existing brokers for merge
  const existingRaw = readFileSync(outputPath, "utf-8");
  const existingData = yaml.load(existingRaw) as { version: string; updated: string; brokers: Record<string, unknown>[] };
  const existingBrokers = existingData?.brokers ?? [];
  const existingDomains = new Set(existingBrokers.map((b) => (b.domain as string)?.toLowerCase()));
  const existingIds = new Set(existingBrokers.map((b) => b.id as string));

  console.log(`Existing brokers: ${existingBrokers.length}`);
  console.log(`Eraser brokers: ${data.brokers.length}`);

  let skippedNoDomain = 0;
  let skippedDuplicate = 0;

  const converted = data.brokers
    .map((b) => {
      const domain = extractDomain(b.website);
      return { ...b, _domain: domain };
    })
    .filter((b) => {
      if (!b._domain) { skippedNoDomain++; return false; }
      if (existingDomains.has(b._domain.toLowerCase())) { skippedDuplicate++; return false; }
      return true;
    })
    .map((b) => {
      let id = b.id ?? generateId(b.name);
      if (existingIds.has(id)) {
        id = `${id}_eraser`;
      }
      existingIds.add(id);
      existingDomains.add(b._domain!.toLowerCase());

      return {
        id,
        name: b.name,
        domain: b._domain!,
        ...(b.email && { email: b.email }),
        region: b.region ?? "us",
        category: normalizeCategory(b.category),
        ...(b.privacy_policy_url && { privacy_policy_url: b.privacy_policy_url }),
        removal_method: inferRemovalMethod(b),
        requires_captcha: false,
        requires_email_confirm: false,
        requires_id_upload: false,
        difficulty: "medium",
        tier: 3,
        status: "unverified",
        public_directory: false,
        verify_before_send: false,
        ...(b.opt_out_url && { opt_out_url: b.opt_out_url }),
      };
    });

  console.log(`\nNew brokers to add: ${converted.length}`);
  console.log(`Skipped (already have): ${skippedDuplicate}`);
  console.log(`Skipped (no website/domain): ${skippedNoDomain}`);

  if (converted.length === 0) {
    console.log("\nNo new brokers to add.");
    return;
  }

  const merged = [...existingBrokers, ...converted];
  const output = {
    version: existingData.version,
    updated: new Date().toISOString().split("T")[0],
    brokers: merged,
  };

  writeFileSync(outputPath, yaml.dump(output, { lineWidth: 120 }));
  console.log(`\n✓ Wrote ${merged.length} total brokers to ${outputPath}`);
  console.log(`  (${existingBrokers.length} existing + ${converted.length} new from Eraser)`);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.log("Usage: npx tsx scripts/convert-eraser-brokers.ts <eraser-brokers.yaml>");
  console.log("\nFor MVP, use the curated data/brokers.yaml instead.");
  process.exit(0);
}

const outputPath = process.argv[3] ?? resolve("data/brokers.yaml");
convert(inputPath, outputPath);
