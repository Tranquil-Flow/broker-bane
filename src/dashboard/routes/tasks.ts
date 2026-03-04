import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";
import { taskCard } from "../views/components.js";
import { PendingTaskRepo } from "../../db/repositories/pending-task.repo.js";
import { RemovalRequestRepo } from "../../db/repositories/removal-request.repo.js";

export function registerTaskRoutes(app: Hono, db: Database): void {
  app.get("/tasks", (c) => {
    const taskRepo = new PendingTaskRepo(db);
    const requestRepo = new RemovalRequestRepo(db);
    const pendingTasks = taskRepo.getPending();

    const tasksHtml = pendingTasks.length > 0
      ? pendingTasks
          .map((t) => {
            const request = requestRepo.getById(t.request_id);
            const brokerId = request?.broker_id ?? "unknown";
            return taskCard(t.id, t.task_type, t.description, brokerId, t.url, t.created_at);
          })
          .join("\n")
      : `<div class="dim">No pending tasks. All clear.</div>`;

    const bodyHtml = `
<div class="panel">
  <div class="panel-header">
    <span class="panel-title">Pending Tasks</span>
    <span class="panel-badge">${pendingTasks.length} PENDING</span>
  </div>
  ${pendingTasks.length > 1 ? `<div style="padding:0.75rem 1.25rem;border-bottom:1px solid var(--border)">
    <button class="task-btn" hx-post="/api/tasks/complete-all" hx-target="#tasks-list" hx-swap="innerHTML">MARK ALL DONE</button>
  </div>` : ""}
  <div class="panel-body" id="tasks-list" style="max-height:none">
    ${tasksHtml}
  </div>
</div>`;

    return c.html(layout("Tasks", "TASKS", bodyHtml));
  });

  app.post("/api/tasks/complete-all", (c) => {
    const taskRepo = new PendingTaskRepo(db);
    const pending = taskRepo.getPending();
    for (const task of pending) {
      taskRepo.markCompleted(task.id);
    }
    return c.html(`<div class="dim">All tasks marked as completed.</div>`);
  });
}
