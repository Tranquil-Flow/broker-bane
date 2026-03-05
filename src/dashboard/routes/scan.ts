import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";
import { escapeHtml, scanSummaryCard, exposureListItem } from "../views/components.js";
import { ScanRunRepo, ScanResultRepo } from "../../db/repositories/scan.repo.js";
import { loadBrokerDatabase } from "../../data/broker-loader.js";
import { BrokerStore } from "../../data/broker-store.js";

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

export function registerScanRoutes(app: Hono, db: Database): void {
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

    const bodyHtml = `
<div class="content-section">
  <h2>Exposure Scanner</h2>
  <p>Checks people search brokers for your personal data listings.</p>
</div>

<div class="panel">
  <div class="panel-header">
    <span class="panel-title">Scan History</span>
    <span class="panel-badge">${runs.length} RUNS</span>
  </div>
  <div class="panel-body" style="padding:0.5rem 0">
    ${historyHtml}
  </div>
</div>

${resultsHtml}`;

    return c.html(layout("Scan", "SCAN", bodyHtml));
  });

  app.get("/api/scan-summary", (c) => {
    return c.html(renderScanSummaryHtml(db));
  });
}
