#!/usr/bin/env tsx
/**
 * convert-eraser-brokers.ts
 *
 * One-time conversion script to port Eraser's 764 broker database
 * (https://github.com/nicholasgasior/eraser) to BrokerBane's extended format.
 *
 * Eraser's broker YAML fields:
 *   - name, domain, email, region, category, privacy_policy_url, opt_out_url
 *
 * BrokerBane extends with:
 *   - search_url, removal_method, requires_captcha, requires_email_confirm,
 *     requires_id_upload, difficulty, confirm_sender_pattern, tier,
 *     parent_company, subsidiary_of, public_directory, verify_before_send,
 *     form_hints
 *
 * Usage: npx tsx scripts/convert-eraser-brokers.ts [path-to-eraser-brokers.yaml]
 *
 * For the MVP, we ship data/brokers.yaml with 25 curated brokers.
 * Full 764-broker conversion is a post-MVP task.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

interface EraserBroker {
  name: string;
  domain: string;
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

  const converted = data.brokers.map((b) => ({
    id: generateId(b.name),
    name: b.name,
    domain: b.domain,
    ...(b.email && { email: b.email }),
    region: b.region ?? "us",
    category: b.category ?? "data_broker",
    ...(b.privacy_policy_url && { privacy_policy_url: b.privacy_policy_url }),
    removal_method: inferRemovalMethod(b),
    requires_captcha: false,
    requires_email_confirm: false,
    requires_id_upload: false,
    difficulty: "medium",
    tier: 2,
    public_directory: false,
    verify_before_send: false,
    ...(b.opt_out_url && { opt_out_url: b.opt_out_url }),
  }));

  const output = {
    version: "1.0.0",
    updated: new Date().toISOString().split("T")[0],
    brokers: converted,
  };

  writeFileSync(outputPath, yaml.dump(output, { lineWidth: 120 }));
  console.log(`Converted ${converted.length} brokers to ${outputPath}`);
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.log("Usage: npx tsx scripts/convert-eraser-brokers.ts <eraser-brokers.yaml>");
  console.log("\nFor MVP, use the curated data/brokers.yaml instead.");
  process.exit(0);
}

const outputPath = process.argv[3] ?? resolve("data/brokers.yaml");
convert(inputPath, outputPath);
