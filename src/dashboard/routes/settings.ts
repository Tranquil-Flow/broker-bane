import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import type { AppConfig } from "../../types/config.js";
import { redactPii } from "../../util/redact.js";
import { resolveConfigPath } from "../../config/loader.js";
import { readFileSync } from "node:fs";
import { layout } from "../views/layout.js";

export function registerSettingsRoutes(app: Hono, db: Database, config: AppConfig): void {
  app.get("/settings", (c) => {
    const { profile } = config;
    const hasImap = !!config.inbox;
    const hasBrowser = !!(config.browser && config.browser.api_key);

    // DB stats
    const tables = ["removal_requests", "broker_responses", "email_log", "circuit_breaker_state", "pipeline_runs"];
    const dbStats = Object.fromEntries(
      tables.map((t) => {
        try {
          const row = db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get() as { c: number };
          return [t, row.c];
        } catch {
          return [t, "error"];
        }
      })
    );

    // App version
    let appVersion = "unknown";
    try {
      const pkgPath = new URL("../../../package.json", import.meta.url).pathname;
      appVersion = (JSON.parse(readFileSync(pkgPath, "utf-8")) as { version: string }).version;
    } catch { /* ignore */ }

    const configPath = resolveConfigPath();
    const names = [profile.first_name, profile.last_name].filter(Boolean);
    const fullName = names.join(" ");
    const redactedConfigPath = redactPii(configPath, { names: fullName ? [fullName] : undefined });

    const bodyHtml = `
<div class="content-section">
  <h2>Profile</h2>
  <table class="broker-table">
    <tr><td>Name</td><td>${redactPii(fullName || "not set", { names: fullName ? [fullName] : undefined })}</td></tr>
    <tr><td>Email</td><td>${redactPii(profile.email ?? "not set", { names: fullName ? [fullName] : undefined })}</td></tr>
    <tr><td>Country</td><td>${profile.country ?? "US"}</td></tr>
    <tr><td>Config file</td><td>${redactedConfigPath}</td></tr>
  </table>
</div>

<div class="content-section">
  <h2>Services</h2>
  <table class="broker-table">
    <tr><td>SMTP</td><td class="status-confirmed">✓ configured</td></tr>
    <tr><td>IMAP</td><td class="${hasImap ? "status-confirmed" : "status-pending"}">${hasImap ? "✓ configured" : "✗ not configured"}</td></tr>
    <tr><td>Browser automation</td><td class="${hasBrowser ? "status-confirmed" : "status-pending"}">${hasBrowser ? "✓ configured" : "✗ not configured"}</td></tr>
  </table>
</div>

<div class="content-section">
  <h2>Options</h2>
  <table class="broker-table">
    <tr><td>Template</td><td>${config.options?.template ?? "gdpr"}</td></tr>
    <tr><td>Regions</td><td>${(config.options?.regions ?? ["us"]).join(", ")}</td></tr>
    <tr><td>Dry run</td><td>${config.options?.dry_run ? "yes" : "no"}</td></tr>
    <tr><td>Verify before send</td><td>${config.options?.verify_before_send ? "yes" : "no"}</td></tr>
    <tr><td>Scan interval</td><td>${config.options?.scan_interval_days ?? 30} days</td></tr>
  </table>
</div>

<div class="content-section">
  <h2>Debug Info</h2>
  <table class="broker-table">
    <tr><td>BrokerBane</td><td>${appVersion}</td></tr>
    <tr><td>Node.js</td><td>${process.version}</td></tr>
    <tr><td>Platform</td><td>${process.platform} ${process.arch}</td></tr>
    ${tables.map((t) => `<tr><td>${t}</td><td>${dbStats[t]} rows</td></tr>`).join("\n    ")}
  </table>
  <p style="color: var(--text-dim); font-size: 0.75rem; margin-top: 1rem;">
    ⚠ Profile data above is partially redacted. Run <code>brokerbane debug-report</code> for the full report.
  </p>
</div>`;

    return c.html(layout("Settings", "SETTINGS", bodyHtml));
  });
}
