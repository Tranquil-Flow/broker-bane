import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import type { Broker } from "../../types/broker.js";
import { layout } from "../views/layout.js";
import { brokerTableRow, escapeHtml } from "../views/components.js";
import { loadBrokerDatabase } from "../../data/broker-loader.js";
import { RemovalRequestRepo } from "../../db/repositories/removal-request.repo.js";

let cachedBrokers: Broker[] | null = null;

function getBrokers(): Broker[] {
  if (cachedBrokers === null) {
    const { brokers } = loadBrokerDatabase();
    cachedBrokers = brokers;
  }
  return cachedBrokers;
}

interface BrokerWithStatus {
  broker: Broker;
  status: string;
  lastAction: string;
}

function getBrokersWithStatus(db: Database): BrokerWithStatus[] {
  const brokers = getBrokers();
  const requestRepo = new RemovalRequestRepo(db);

  return brokers.map((broker) => {
    const latest = requestRepo.getLatestForBroker(broker.id);
    return {
      broker,
      status: latest?.status ?? "pending",
      lastAction: latest?.updated_at ?? "--",
    };
  });
}

function filterBrokers(
  items: BrokerWithStatus[],
  query: { category?: string; region?: string; tier?: string; status?: string; search?: string },
): BrokerWithStatus[] {
  let filtered = items;

  if (query.category) {
    filtered = filtered.filter((b) => b.broker.category === query.category);
  }
  if (query.region) {
    filtered = filtered.filter((b) => b.broker.region === query.region);
  }
  if (query.tier) {
    const tier = Number(query.tier);
    filtered = filtered.filter((b) => b.broker.tier === tier);
  }
  if (query.status) {
    filtered = filtered.filter((b) => b.status === query.status);
  }
  if (query.search) {
    const s = query.search.toLowerCase();
    filtered = filtered.filter(
      (b) =>
        b.broker.name.toLowerCase().includes(s) ||
        b.broker.domain.toLowerCase().includes(s) ||
        b.broker.id.toLowerCase().includes(s),
    );
  }

  return filtered;
}

function renderBrokerTableBody(items: BrokerWithStatus[]): string {
  if (items.length === 0) {
    return `<tr><td colspan="9" class="dim" style="text-align:center;padding:2rem">No brokers match the current filters.</td></tr>`;
  }

  return items
    .map((b) =>
      brokerTableRow(
        b.broker.name,
        b.broker.domain,
        b.broker.category,
        b.broker.region,
        b.broker.tier,
        b.broker.removal_method,
        b.broker.difficulty,
        b.status,
        b.lastAction,
      ),
    )
    .join("\n");
}

function renderFilters(): string {
  return `<div class="filters">
  <select name="category" class="filter-select" hx-get="/api/brokers" hx-target="#broker-tbody" hx-include=".filters [name]">
    <option value="">All Categories</option>
    <option value="people_search">People Search</option>
    <option value="data_broker">Data Broker</option>
    <option value="marketing_data">Marketing Data</option>
    <option value="data_aggregator">Data Aggregator</option>
    <option value="background_check">Background Check</option>
    <option value="business_data">Business Data</option>
    <option value="credit_bureau">Credit Bureau</option>
  </select>
  <select name="region" class="filter-select" hx-get="/api/brokers" hx-target="#broker-tbody" hx-include=".filters [name]">
    <option value="">All Regions</option>
    <option value="us">US</option>
    <option value="eu">EU</option>
    <option value="global">Global</option>
  </select>
  <select name="tier" class="filter-select" hx-get="/api/brokers" hx-target="#broker-tbody" hx-include=".filters [name]">
    <option value="">All Tiers</option>
    <option value="1">Tier 1</option>
    <option value="2">Tier 2</option>
    <option value="3">Tier 3</option>
  </select>
  <select name="status" class="filter-select" hx-get="/api/brokers" hx-target="#broker-tbody" hx-include=".filters [name]">
    <option value="">All Statuses</option>
    <option value="pending">Pending</option>
    <option value="sent">Sent</option>
    <option value="awaiting_confirmation">Awaiting Confirmation</option>
    <option value="confirmed">Confirmed</option>
    <option value="completed">Completed</option>
    <option value="failed">Failed</option>
  </select>
  <input type="text" name="search" class="filter-input" placeholder="Search brokers..." hx-get="/api/brokers" hx-target="#broker-tbody" hx-trigger="keyup changed delay:300ms" hx-include=".filters [name]">
</div>`;
}

export function registerBrokerRoutes(app: Hono, db: Database): void {
  app.get("/brokers", (c) => {
    const all = getBrokersWithStatus(db);

    const bodyHtml = `
<div class="panel">
  <div class="panel-header">
    <span class="panel-title">Broker Database</span>
    <span class="panel-badge">${all.length} BROKERS</span>
  </div>
  ${renderFilters()}
  <div style="overflow-x:auto">
    <table class="broker-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Domain</th>
          <th>Category</th>
          <th>Region</th>
          <th>Tier</th>
          <th>Method</th>
          <th>Difficulty</th>
          <th>Status</th>
          <th>Last Action</th>
        </tr>
      </thead>
      <tbody id="broker-tbody">
        ${renderBrokerTableBody(all)}
      </tbody>
    </table>
  </div>
</div>`;

    return c.html(layout("Brokers", "BROKERS", bodyHtml));
  });

  app.get("/api/brokers", (c) => {
    const all = getBrokersWithStatus(db);
    const query = {
      category: c.req.query("category") || undefined,
      region: c.req.query("region") || undefined,
      tier: c.req.query("tier") || undefined,
      status: c.req.query("status") || undefined,
      search: c.req.query("search") || undefined,
    };
    const filtered = filterBrokers(all, query);
    return c.html(renderBrokerTableBody(filtered));
  });

  app.get("/api/brokers/:id", (c) => {
    const brokerId = c.req.param("id");
    const brokers = getBrokers();
    const broker = brokers.find((b) => b.id === brokerId);

    if (!broker) {
      return c.html(`<div class="dim">Broker not found.</div>`, 404);
    }

    const requestRepo = new RemovalRequestRepo(db);
    const requests = requestRepo.getByBrokerId(brokerId);
    const latest = requests[0];

    const historyHtml = requests.length > 0
      ? requests
          .map(
            (r) =>
              `<div class="log-entry ${r.status === "failed" ? "fail" : "sent"}">
  <span class="log-time">${escapeHtml(r.updated_at)}</span>
  <span class="log-msg"><span class="tag">[${escapeHtml(r.method)}]</span> ${escapeHtml(r.status)}${r.last_error ? ` - ${escapeHtml(r.last_error)}` : ""}</span>
</div>`,
          )
          .join("\n")
      : `<div class="dim">No removal history.</div>`;

    return c.html(`<div class="panel" style="margin:1rem 0">
  <div class="panel-header">
    <span class="panel-title">${escapeHtml(broker.name)}</span>
    <span class="panel-badge">${escapeHtml(broker.removal_method.toUpperCase())}</span>
  </div>
  <div style="padding:1rem 1.25rem;font-size:0.75rem">
    <div style="margin-bottom:0.5rem"><span style="color:var(--text-dim)">Domain:</span> <span style="color:var(--white)">${escapeHtml(broker.domain)}</span></div>
    <div style="margin-bottom:0.5rem"><span style="color:var(--text-dim)">Category:</span> ${escapeHtml(broker.category)}</div>
    <div style="margin-bottom:0.5rem"><span style="color:var(--text-dim)">Region:</span> ${escapeHtml(broker.region)} | <span style="color:var(--text-dim)">Tier:</span> ${broker.tier} | <span style="color:var(--text-dim)">Difficulty:</span> ${escapeHtml(broker.difficulty)}</div>
    ${broker.email ? `<div style="margin-bottom:0.5rem"><span style="color:var(--text-dim)">Email:</span> ${escapeHtml(broker.email)}</div>` : ""}
    ${broker.opt_out_url ? `<div style="margin-bottom:0.5rem"><span style="color:var(--text-dim)">Opt-out:</span> <a href="${escapeHtml(broker.opt_out_url)}" target="_blank" style="color:var(--cyan)">${escapeHtml(broker.opt_out_url)}</a></div>` : ""}
    <div style="margin-bottom:0.5rem"><span style="color:var(--text-dim)">CAPTCHA:</span> ${broker.requires_captcha ? "YES" : "NO"} | <span style="color:var(--text-dim)">Email confirm:</span> ${broker.requires_email_confirm ? "YES" : "NO"} | <span style="color:var(--text-dim)">ID upload:</span> ${broker.requires_id_upload ? "YES" : "NO"}</div>
    <div style="margin-top:1rem;border-top:1px solid var(--border);padding-top:0.75rem">
      <div style="color:var(--white);margin-bottom:0.5rem;font-size:0.7rem;letter-spacing:0.1em">REMOVAL HISTORY</div>
      ${historyHtml}
    </div>
  </div>
</div>`);
  });
}
