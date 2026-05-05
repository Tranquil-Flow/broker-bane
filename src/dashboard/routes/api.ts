import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { renderStatsHtml, renderActivityHtml, renderCircuitBreakersHtml, renderTasksHtml } from "./dashboard.js";
import { PendingTaskRepo } from "../../db/repositories/pending-task.repo.js";
import { RemovalRequestRepo } from "../../db/repositories/removal-request.repo.js";

function taskDoneHtml(message: string): string {
  return `<div class="dim">${message}</div>`;
}

function taskRequestRepos(db: Database): { taskRepo: PendingTaskRepo; requestRepo: RemovalRequestRepo } {
  return { taskRepo: new PendingTaskRepo(db), requestRepo: new RemovalRequestRepo(db) };
}

function completeTaskWithRequest(db: Database, id: number, requestStatus: string, error?: string): boolean {
  const { taskRepo, requestRepo } = taskRequestRepos(db);
  const task = taskRepo.getById(id);
  if (!task) return false;
  taskRepo.markCompleted(id);
  requestRepo.updateStatus(task.request_id, requestStatus, error);
  return true;
}

export function registerApiRoutes(app: Hono, db: Database): void {
  app.get("/api/stats", (c) => {
    return c.html(renderStatsHtml(db));
  });

  app.get("/api/activity", (c) => {
    return c.html(renderActivityHtml(db));
  });

  app.get("/api/circuit-breakers", (c) => {
    return c.html(renderCircuitBreakersHtml(db));
  });

  app.get("/api/tasks", (c) => {
    return c.html(renderTasksHtml(db));
  });

  app.post("/api/tasks/:id/complete", (c) => {
    const id = Number(c.req.param("id"));
    if (!completeTaskWithRequest(db, id, "completed")) return c.notFound();
    return c.html(taskDoneHtml("Task marked complete."));
  });

  app.post("/api/tasks/:id/retry", (c) => {
    const id = Number(c.req.param("id"));
    if (!completeTaskWithRequest(db, id, "pending")) return c.notFound();
    return c.html(taskDoneHtml("Task queued for retry."));
  });

  app.post("/api/tasks/:id/dismiss", async (c) => {
    const id = Number(c.req.param("id"));
    const form = await c.req.parseBody();
    const rawReason = form.reason;
    const reason = typeof rawReason === "string" && rawReason.trim().length > 0
      ? rawReason.trim()
      : "Dismissed from dashboard";
    if (!completeTaskWithRequest(db, id, "skipped", `Dismissed from dashboard: ${reason}`)) return c.notFound();
    return c.html(taskDoneHtml("Task dismissed."));
  });
}
