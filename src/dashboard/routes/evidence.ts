import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";
import { escapeHtml, evidenceStatusBadge, evidenceEntryCard, beforeAfterScreenshots } from "../views/components.js";
import { EvidenceChainRepo } from "../../db/repositories/evidence-chain.repo.js";
import { EvidenceChainService } from "../../pipeline/evidence-chain.js";
import { RemovalRequestRepo } from "../../db/repositories/removal-request.repo.js";
import { loadBrokerDatabase } from "../../data/broker-loader.js";
import { BrokerStore } from "../../data/broker-store.js";

export function registerEvidenceRoutes(app: Hono, db: Database): void {
  app.get("/evidence", (c) => {
    const repo = new EvidenceChainRepo(db);
    const service = new EvidenceChainService(repo);
    const brokerDb = loadBrokerDatabase();
    const store = new BrokerStore(brokerDb.brokers);

    const chainResult = service.verifyChain();
    const entries = repo.getAll();

    // Group entries by broker
    const byBroker = new Map<string, typeof entries>();
    for (const entry of entries) {
      const list = byBroker.get(entry.broker_id);
      if (list) list.push(entry);
      else byBroker.set(entry.broker_id, [entry]);
    }

    let brokerSectionHtml = "";
    for (const [brokerId, brokerEntries] of byBroker) {
      const broker = store.getById(brokerId);
      const name = broker?.name ?? brokerId;

      brokerSectionHtml += `
<div class="panel" style="margin-bottom:1rem">
  <div class="panel-header">
    <span class="panel-title">${escapeHtml(name)}</span>
    <span class="panel-badge">${brokerEntries.length} ENTRIES</span>
  </div>
  <div class="panel-body">`;

      for (const entry of brokerEntries) {
        brokerSectionHtml += evidenceEntryCard(
          entry.entry_type,
          entry.content_hash,
          entry.prev_hash,
          entry.screenshot_path,
          entry.created_at
        );
      }

      brokerSectionHtml += `
  </div>
</div>`;
    }

    if (entries.length === 0) {
      brokerSectionHtml = `<div class="dim">No evidence entries yet. Run 'brokerbane scan' or 'brokerbane remove' to start building proof.</div>`;
    }

    const bodyHtml = `
<div class="content-section">
  <h2>Evidence Chain</h2>
  <p>Cryptographic proof of data removal. Each entry chains to the previous via SHA-256 hashes.</p>
</div>

<div style="margin-bottom:1.5rem">
  ${evidenceStatusBadge(chainResult.valid, chainResult.totalEntries, chainResult.brokenAt)}
</div>

${brokerSectionHtml}`;

    return c.html(layout("Evidence", "EVIDENCE", bodyHtml));
  });

  app.get("/evidence/:requestId", (c) => {
    const requestId = parseInt(c.req.param("requestId"), 10);
    if (isNaN(requestId)) return c.text("Invalid request ID", 400);

    const repo = new EvidenceChainRepo(db);
    const service = new EvidenceChainService(repo);
    const requestRepo = new RemovalRequestRepo(db);

    const request = requestRepo.getById(requestId);
    if (!request) return c.text("Request not found", 404);

    const brokerDb = loadBrokerDatabase();
    const store = new BrokerStore(brokerDb.brokers);
    const broker = store.getById(request.broker_id);
    const name = broker?.name ?? request.broker_id;

    const entries = repo.getByRequestId(requestId);
    const diff = service.getTextDiff(request.broker_id);

    let entriesHtml = "";
    for (const entry of entries) {
      entriesHtml += evidenceEntryCard(
        entry.entry_type,
        entry.content_hash,
        entry.prev_hash,
        entry.screenshot_path,
        entry.created_at
      );
    }

    let diffHtml = "";
    if (diff && (diff.removedLines.length > 0 || diff.addedLines.length > 0)) {
      diffHtml = `
<div class="panel" style="margin-top:1.5rem">
  <div class="panel-header">
    <span class="panel-title">Text Diff</span>
    <span class="panel-badge">BEFORE / AFTER</span>
  </div>
  <div class="panel-body" style="padding:1rem">
    <div style="font-size:0.75rem">`;

      if (diff.removedLines.length > 0) {
        diffHtml += `<div style="margin-bottom:0.5rem;color:var(--red)">Removed (personal data no longer visible):</div>`;
        for (const line of diff.removedLines.slice(0, 30)) {
          diffHtml += `<div style="color:var(--red);padding:0.1rem 0">- ${escapeHtml(line)}</div>`;
        }
      }
      if (diff.addedLines.length > 0) {
        diffHtml += `<div style="margin-top:0.5rem;margin-bottom:0.5rem;color:var(--green)">Added:</div>`;
        for (const line of diff.addedLines.slice(0, 15)) {
          diffHtml += `<div style="color:var(--green);padding:0.1rem 0">+ ${escapeHtml(line)}</div>`;
        }
      }
      diffHtml += `
    </div>
  </div>
</div>`;
    }

    // Before/after screenshots
    const beforeEntry = entries.find((e) => e.entry_type === "before_scan" && e.screenshot_path);
    const afterEntry = [...entries].reverse().find(
      (e) => (e.entry_type === "after_removal" || e.entry_type === "re_verification") && e.screenshot_path
    );

    let screenshotsHtml = "";
    if (beforeEntry?.screenshot_path || afterEntry?.screenshot_path) {
      screenshotsHtml = beforeAfterScreenshots(
        beforeEntry?.screenshot_path ?? null,
        afterEntry?.screenshot_path ?? null
      );
    }

    const bodyHtml = `
<div class="content-section">
  <h2>Evidence: ${escapeHtml(name)}</h2>
  <p>Request #${requestId} &mdash; ${escapeHtml(request.status)}</p>
</div>

<div class="panel">
  <div class="panel-header">
    <span class="panel-title">Chain Entries</span>
    <span class="panel-badge">${entries.length} ENTRIES</span>
  </div>
  <div class="panel-body">
    ${entriesHtml || '<div class="dim">No evidence entries for this request.</div>'}
  </div>
</div>

${screenshotsHtml}
${diffHtml}`;

    return c.html(layout(`Evidence: ${name}`, "EVIDENCE", bodyHtml));
  });
}
