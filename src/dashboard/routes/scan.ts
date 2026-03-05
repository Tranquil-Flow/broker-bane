import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import type { AppConfig } from "../../types/config.js";
import { layout } from "../views/layout.js";
import { escapeHtml, scanSummaryCard, exposureListItem } from "../views/components.js";
import { ScanRunRepo, ScanResultRepo } from "../../db/repositories/scan.repo.js";
import { loadBrokerDatabase } from "../../data/broker-loader.js";
import { BrokerStore } from "../../data/broker-store.js";
import { Scanner } from "../../pipeline/scanner.js";
import { logger } from "../../util/logger.js";

let scanInProgress = false;

export function renderScanSummaryHtml(db: Database): string {
  const scanRunRepo = new ScanRunRepo(db);
  const scanResultRepo = new ScanResultRepo(db);
  const latest = scanRunRepo.getLatest();

  if (!latest) {
    return `<div class="dim">No scans yet. Run 'brokerbane scan' to check for your data.</div>`;
  }

  const foundResults = scanResultRepo.getFoundByRunId(latest.id);

  return scanSummaryCard(
    latest.started_at,
    latest.status,
    latest.found_count,
    latest.not_found_count,
    latest.error_count,
    foundResults.map((r) => r.broker_id)
  );
}

export function registerScanRoutes(app: Hono, db: Database, config?: AppConfig): void {
  app.get("/scan", (c) => {
    const scanRunRepo = new ScanRunRepo(db);
    const scanResultRepo = new ScanResultRepo(db);
    const brokerDb = loadBrokerDatabase();
    const store = new BrokerStore(brokerDb.brokers);

    const runs = scanRunRepo.getHistory(10);

    let historyHtml = "";
    if (runs.length === 0) {
      historyHtml = `<div class="dim">No scan history. Run 'brokerbane scan' to start.</div>`;
    } else {
      historyHtml = `<table class="broker-table">
  <thead>
    <tr>
      <th>Date</th>
      <th>Status</th>
      <th>Scanned</th>
      <th>Found</th>
      <th>Clean</th>
      <th>Errors</th>
    </tr>
  </thead>
  <tbody>`;
      for (const run of runs) {
        const statusClass = run.status === "completed" ? "status-completed"
          : run.status === "failed" ? "status-failed"
          : "status-sent";
        historyHtml += `
    <tr>
      <td>${escapeHtml(run.started_at)}</td>
      <td class="${statusClass}">${escapeHtml(run.status)}</td>
      <td>${run.total_brokers}</td>
      <td style="color:var(--red)">${run.found_count}</td>
      <td style="color:var(--green)">${run.not_found_count}</td>
      <td>${run.error_count}</td>
    </tr>`;
      }
      historyHtml += `
  </tbody>
</table>`;
    }

    // Latest scan results detail
    const latest = scanRunRepo.getLatest();
    let resultsHtml = "";
    if (latest) {
      const results = scanResultRepo.getByRunId(latest.id);
      if (results.length > 0) {
        resultsHtml = `<div class="panel" style="margin-top:1.5rem">
  <div class="panel-header">
    <span class="panel-title">Latest Scan Results</span>
    <span class="panel-badge">${results.length} BROKERS</span>
  </div>
  <div class="panel-body">`;
        for (const r of results) {
          const broker = store.getById(r.broker_id);
          const name = broker?.name ?? r.broker_id;
          resultsHtml += exposureListItem(
            name,
            r.broker_id,
            r.found === 1,
            r.error,
            r.created_at
          );
        }
        resultsHtml += `
  </div>
</div>`;
      }
    }

    const scanIntervalDays = config?.options?.scan_interval_days ?? 30;

    const bodyHtml = `
<div class="content-section">
  <h2>Exposure Scanner</h2>
  <p>Checks people search brokers for your personal data listings.</p>
</div>

<div style="background:var(--bg-card);border:1px solid var(--border);padding:1.25rem;margin-bottom:1rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
  <div id="scan-trigger" style="display:flex;align-items:center;gap:1rem">
    <button
      hx-post="/api/scan"
      hx-target="#scan-trigger"
      hx-swap="innerHTML"
      hx-include="[name='autoRemove']"
      style="background:var(--green);color:var(--bg);border:none;padding:0.5rem 1.25rem;font-family:inherit;font-size:0.75rem;letter-spacing:0.1em;cursor:pointer"
      ${scanInProgress ? 'disabled style="opacity:0.5"' : ""}
    >${scanInProgress ? "SCAN RUNNING..." : "RUN SCAN"}</button>
    <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.7rem;color:var(--text-dim);cursor:pointer">
      <input type="checkbox" name="autoRemove" value="1" style="accent-color:var(--green)"> Auto-remove found listings
    </label>
  </div>
  <div style="margin-left:auto;font-size:0.65rem;color:var(--text-dim)">
    Scheduled scans: <span style="color:${scanIntervalDays > 0 ? "var(--cyan)" : "var(--text-dim)"}">${scanIntervalDays > 0 ? `every ${scanIntervalDays}d` : "OFF"}</span>
    ${config ? `<a href="#scan-settings" style="color:var(--cyan);margin-left:0.5rem;text-decoration:none">[settings]</a>` : ""}
  </div>
</div>

<div class="panel">
  <div class="panel-header">
    <span class="panel-title">Scan History</span>
    <span class="panel-badge">${runs.length} RUNS</span>
  </div>
  <div class="panel-body" style="padding:0.5rem 0" hx-get="/scan" hx-trigger="${scanInProgress ? "every 10s" : "none"}" hx-select=".panel-body" hx-swap="innerHTML">
    ${historyHtml}
  </div>
</div>

${resultsHtml}

${config ? renderScanSettingsHtml(scanIntervalDays) : ""}`;

    return c.html(layout("Scan", "SCAN", bodyHtml));
  });

  app.get("/api/scan-summary", (c) => {
    return c.html(renderScanSummaryHtml(db));
  });

  // ─── Scan Trigger Endpoint ────────────────────────────────────────
  app.post("/api/scan", async (c) => {
    if (scanInProgress) {
      return c.html(`<span style="color:var(--amber);font-size:0.75rem;letter-spacing:0.1em">SCAN ALREADY IN PROGRESS</span>`);
    }

    if (!config) {
      return c.html(`<span style="color:var(--red);font-size:0.75rem">Config not available</span>`);
    }

    const body = await c.req.parseBody();
    const autoRemove = body["autoRemove"] === "1";

    scanInProgress = true;

    // Run scan async — don't block the HTTP response
    const scanner = new Scanner(config);
    scanner.scan({ autoRemove }).then((summary) => {
      logger.info({ summary }, "Dashboard-triggered scan completed");
    }).catch((err) => {
      logger.error({ err }, "Dashboard-triggered scan failed");
    }).finally(() => {
      scanInProgress = false;
      scanner.cleanup();
    });

    return c.html(`<span style="color:var(--green);font-size:0.75rem;letter-spacing:0.1em">SCAN STARTED</span>
<span style="font-size:0.65rem;color:var(--text-dim);margin-left:0.5rem">${autoRemove ? "(auto-remove enabled)" : ""} — page will refresh</span>
<script>setTimeout(() => location.reload(), 5000)</script>`);
  });

  // ─── Scan Settings Endpoint ───────────────────────────────────────
  app.post("/api/scan-settings", async (c) => {
    if (!config) {
      return c.html(`<span style="color:var(--red)">Config not available</span>`);
    }

    const body = await c.req.parseBody();
    const action = body["action"];

    // Handle disable button
    const newInterval = action === "disable" ? 0 : parseInt(String(body["scan_interval_days"]), 10);

    if (isNaN(newInterval) || newInterval < 0 || newInterval > 365) {
      return c.html(renderScanSettingsHtml(config.options.scan_interval_days, "Invalid value (1-365)"));
    }

    try {
      const { updateConfigField, resolveConfigPath } = await import("../../config/loader.js");
      const configPath = resolveConfigPath();
      updateConfigField(configPath, "options.scan_interval_days", newInterval);
      (config.options as any).scan_interval_days = newInterval;
      return c.html(renderScanSettingsHtml(newInterval, "Saved"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.html(renderScanSettingsHtml(config.options.scan_interval_days, `Error: ${msg}`));
    }
  });
}

function renderScanSettingsHtml(intervalDays: number, message?: string): string {
  const disabled = intervalDays <= 0;

  return `<div id="scan-settings" style="background:var(--bg-card);border:1px solid var(--border);padding:1.25rem;margin-top:1.5rem">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
    <span style="font-size:0.7rem;letter-spacing:0.1em;color:var(--white)">SCAN SETTINGS</span>
    <span style="font-size:0.65rem;color:${disabled ? "var(--text-dim)" : "var(--green)"}">${disabled ? "SCHEDULED SCANS OFF" : "SCHEDULED SCANS ON"}</span>
  </div>
  <form hx-post="/api/scan-settings" hx-target="#scan-settings" hx-swap="outerHTML" style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
    <label style="font-size:0.7rem;color:var(--text-dim)">Scan every</label>
    <input type="number" name="scan_interval_days" value="${disabled ? 30 : intervalDays}" min="1" max="365"
      style="width:60px;background:var(--bg);border:1px solid var(--border);color:var(--text);padding:0.3rem 0.5rem;font-family:inherit;font-size:0.75rem;text-align:center${disabled ? ";opacity:0.5" : ""}">
    <span style="font-size:0.7rem;color:var(--text-dim)">days</span>
    <button type="submit" name="action" value="save"
      style="background:var(--cyan);color:var(--bg);border:none;padding:0.35rem 1rem;font-family:inherit;font-size:0.7rem;letter-spacing:0.1em;cursor:pointer">${disabled ? "ENABLE" : "SAVE"}</button>
    <button type="submit" name="action" value="disable"
      style="background:${disabled ? "var(--bg)" : "var(--red)"};color:${disabled ? "var(--text-dim)" : "var(--bg)"};border:1px solid ${disabled ? "var(--border)" : "var(--red)"};padding:0.35rem 1rem;font-family:inherit;font-size:0.7rem;letter-spacing:0.1em;cursor:pointer${disabled ? ";opacity:0.5;pointer-events:none" : ""}">DISABLE</button>
    ${message ? `<span style="font-size:0.65rem;color:${message.startsWith("Error") ? "var(--red)" : "var(--green)"};margin-left:0.5rem">${escapeHtml(message)}</span>` : ""}
  </form>
</div>`;
}
