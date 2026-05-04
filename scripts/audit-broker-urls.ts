import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

interface BrokerRecord {
  id: string;
  name: string;
  tier?: number;
  domain?: string;
  opt_out_url?: string;
  privacy_policy_url?: string;
  search_url?: string;
}

interface AuditTarget {
  brokerId: string;
  brokerName: string;
  tier?: number;
  kind: "opt_out_url" | "privacy_policy_url" | "search_url" | "domain";
  url: string;
}

interface AuditResult extends AuditTarget {
  ok: boolean;
  blocked?: boolean;
  status?: number;
  finalUrl?: string;
  error?: string;
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args.set(key, true);
    else {
      args.set(key, next);
      i++;
    }
  }
  return {
    tier: args.has("tier") ? Number(args.get("tier")) : undefined,
    limit: args.has("limit") ? Number(args.get("limit")) : undefined,
    timeoutMs: args.has("timeout-ms") ? Number(args.get("timeout-ms")) : 10_000,
    json: Boolean(args.get("json")),
  };
}

function normalizeUrl(raw: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

export function collectAuditTargets(brokers: BrokerRecord[], tier?: number, limit?: number): AuditTarget[] {
  const selected = brokers
    .filter((broker) => tier === undefined || broker.tier === tier)
    .slice(0, limit ?? brokers.length);

  const targets: AuditTarget[] = [];
  for (const broker of selected) {
    const fields: Array<AuditTarget["kind"]> = ["opt_out_url", "privacy_policy_url", "search_url"];
    for (const kind of fields) {
      const url = broker[kind];
      if (url) targets.push({ brokerId: broker.id, brokerName: broker.name, tier: broker.tier, kind, url: normalizeUrl(url) });
    }
    if (broker.domain) {
      targets.push({ brokerId: broker.id, brokerName: broker.name, tier: broker.tier, kind: "domain", url: normalizeUrl(broker.domain) });
    }
  }
  return targets;
}

async function checkUrl(target: AuditTarget, timeoutMs: number): Promise<AuditResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response = await fetch(target.url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BrokerBane URL audit (+https://github.com/Tranquil-Flow/broker-bane)" },
    });
    if (response.status === 405 || response.status === 403) {
      response = await fetch(target.url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "User-Agent": "BrokerBane URL audit (+https://github.com/Tranquil-Flow/broker-bane)" },
      });
    }
    const blocked = response.status === 401 || response.status === 403;
    const ok = (response.status >= 200 && response.status < 400) || blocked;
    return { ...target, ok, blocked, status: response.status, finalUrl: response.url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ...target, ok: false, error };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const { tier, limit, timeoutMs, json } = parseArgs(process.argv.slice(2));
  const raw = readFileSync(resolve("data/brokers.yaml"), "utf8");
  const doc = yaml.load(raw) as { brokers: BrokerRecord[] };
  const targets = collectAuditTargets(doc.brokers, tier, limit);
  const results: AuditResult[] = [];

  for (const target of targets) {
    const result = await checkUrl(target, timeoutMs);
    results.push(result);
    if (!json) {
      const marker = result.ok ? (result.blocked ? "auth" : "ok") : "FAIL";
      const status = result.status ? ` ${result.status}` : "";
      const error = result.error ? ` ${result.error}` : "";
      console.log(`${marker.padEnd(4)}${status.padEnd(5)} ${target.brokerId} ${target.kind} ${target.url}${error}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  const summary = { checked: results.length, failed: failed.length, failures: failed };
  if (json) console.log(JSON.stringify({ results, summary }, null, 2));
  else console.log(`\nChecked ${summary.checked} URLs; ${summary.failed} failed.`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.stack : err);
    process.exitCode = 1;
  });
}
