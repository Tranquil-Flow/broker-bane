import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { renderStatsHtml, renderActivityHtml, renderCircuitBreakersHtml, renderTasksHtml } from "./dashboard.js";
import { PendingTaskRepo } from "../../db/repositories/pending-task.repo.js";

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
    const taskRepo = new PendingTaskRepo(db);
    taskRepo.markCompleted(id);
    return c.text("");
  });
}
