import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";
import { statCard, progressBar, logEntry, circuitBreakerCard, taskCard } from "../views/components.js";
import { RemovalRequestRepo } from "../../db/repositories/removal-request.repo.js";
import { CircuitBreakerRepo } from "../../db/repositories/circuit-breaker.repo.js";
import { PendingTaskRepo } from "../../db/repositories/pending-task.repo.js";
import { loadBrokerDatabase } from "../../data/broker-loader.js";

let cachedBrokerCount: number | null = null;

function getBrokerCount(): number {
  if (cachedBrokerCount === null) {
    const { brokers } = loadBrokerDatabase();
    cachedBrokerCount = brokers.length;
  }
  return cachedBrokerCount;
}

export function renderStatsHtml(db: Database): string {
  const requestRepo = new RemovalRequestRepo(db);
  const statusCounts = requestRepo.countByStatus();

  const totalBrokers = getBrokerCount();
  const completed = (statusCounts["completed"] ?? 0) + (statusCounts["confirmed"] ?? 0);
  const inProgress =
    (statusCounts["sent"] ?? 0) +
    (statusCounts["sending"] ?? 0) +
    (statusCounts["awaiting_confirmation"] ?? 0) +
    (statusCounts["scanning"] ?? 0) +
    (statusCounts["matched"] ?? 0);
  const failed = statusCounts["failed"] ?? 0;

  return `<div class="stats-grid">
  ${statCard("TOTAL TARGETS", totalBrokers, "targets", `${totalBrokers} brokers loaded`, "[#]")}
  ${statCard("NEUTRALIZED", completed, "success", "completed + confirmed", "[+]")}
  ${statCard("IN PROGRESS", inProgress, "pending", "active operations", "[~]")}
  ${statCard("FAILED", failed, "failed", "requires attention", "[!]")}
</div>`;
}

export function renderActivityHtml(db: Database): string {
  const requestRepo = new RemovalRequestRepo(db);
  const allRequests = requestRepo.getAll();

  // Sort by updated_at DESC, take last 20
  const sorted = allRequests
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 20);

  if (sorted.length === 0) {
    return `<div class="dim">No activity yet. Run 'brokerbane run' to start.</div>`;
  }

  return sorted
    .map((r) => logEntry(r.updated_at, r.status, r.broker_id, r.method, r.last_error))
    .join("\n");
}

export function renderCircuitBreakersHtml(db: Database): string {
  const cbRepo = new CircuitBreakerRepo(db);
  const openBreakers = cbRepo.getOpen();

  if (openBreakers.length === 0) {
    return `<div class="dim">All circuits closed. No issues detected.</div>`;
  }

  return openBreakers
    .map((cb) =>
      circuitBreakerCard(cb.broker_id, cb.state, cb.failure_count, cb.cooldown_until),
    )
    .join("\n");
}

export function renderTasksHtml(db: Database): string {
  const taskRepo = new PendingTaskRepo(db);
  const requestRepo = new RemovalRequestRepo(db);
  const pendingTasks = taskRepo.getPending().slice(0, 5);

  if (pendingTasks.length === 0) {
    return `<div class="dim">No manual tasks pending.</div>`;
  }

  return pendingTasks
    .map((t) => {
      const request = requestRepo.getById(t.request_id);
      const brokerId = request?.broker_id ?? "unknown";
      return taskCard(t.id, t.task_type, t.description, brokerId, t.url, t.created_at);
    })
    .join("\n");
}

export function registerDashboardRoutes(app: Hono, db: Database): void {
  app.get("/", (c) => {
    const requestRepo = new RemovalRequestRepo(db);
    const statusCounts = requestRepo.countByStatus();

    const totalBrokers = getBrokerCount();
    const completed = (statusCounts["completed"] ?? 0) + (statusCounts["confirmed"] ?? 0);
    const inProgress =
      (statusCounts["sent"] ?? 0) +
      (statusCounts["sending"] ?? 0) +
      (statusCounts["awaiting_confirmation"] ?? 0) +
      (statusCounts["scanning"] ?? 0) +
      (statusCounts["matched"] ?? 0);
    const failed = statusCounts["failed"] ?? 0;
    const queued = totalBrokers - completed - inProgress - failed;

    const bodyHtml = `
<div id="stats-panel" hx-get="/api/stats" hx-trigger="every 60s" hx-swap="innerHTML">
  ${renderStatsHtml(db)}
</div>

${progressBar(completed, totalBrokers, inProgress, failed, queued > 0 ? queued : 0)}

<div class="columns">
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Activity Feed</span>
      <span class="panel-badge live">LIVE</span>
    </div>
    <div class="panel-body" id="activity-feed" hx-get="/api/activity" hx-trigger="every 30s" hx-swap="innerHTML">
      ${renderActivityHtml(db)}
    </div>
  </div>
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Circuit Breakers</span>
      <span class="panel-badge">MONITORS</span>
    </div>
    <div class="panel-body" id="circuit-breakers" hx-get="/api/circuit-breakers" hx-trigger="every 60s" hx-swap="innerHTML">
      ${renderCircuitBreakersHtml(db)}
    </div>
  </div>
</div>

<div class="bottom-section">
  <div class="panel">
    <div class="panel-header">
      <span class="panel-title">Manual Tasks</span>
      <span class="panel-badge">${new PendingTaskRepo(db).countPending()} PENDING</span>
    </div>
    <div class="panel-body" id="tasks-panel" hx-get="/api/tasks" hx-trigger="every 60s" hx-swap="innerHTML">
      ${renderTasksHtml(db)}
    </div>
  </div>
</div>`;

    return c.html(layout("Dashboard", "DASHBOARD", bodyHtml));
  });
}
