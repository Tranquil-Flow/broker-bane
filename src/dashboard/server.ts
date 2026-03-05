import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Database } from "better-sqlite3";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import type { AppConfig } from "../types/config.js";
import { registerDashboardRoutes } from "./routes/dashboard.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerBrokerRoutes } from "./routes/brokers.js";
import { registerTaskRoutes } from "./routes/tasks.js";
import { registerAboutRoutes } from "./routes/about.js";
import { registerCompareRoutes } from "./routes/compare.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerScanRoutes } from "./routes/scan.js";
import { registerEvidenceRoutes } from "./routes/evidence.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createDashboardApp(config: AppConfig, existingDb?: Database): { app: Hono; db: Database } {
  const app = new Hono();
  const db = existingDb ?? createDatabase(config.database.path);
  if (!existingDb) runMigrations(db);

  // Serve vendored HTMX
  app.get("/assets/htmx.min.js", (c) => {
    const js = readFileSync(resolve(__dirname, "assets/htmx.min.js"), "utf-8");
    return c.text(js, 200, { "Content-Type": "application/javascript" });
  });

  // Register routes
  registerDashboardRoutes(app, db);
  registerApiRoutes(app, db);
  registerBrokerRoutes(app, db);
  registerTaskRoutes(app, db);
  registerAboutRoutes(app, db);
  registerCompareRoutes(app, db);
  registerSetupRoutes(app, db);
  registerScanRoutes(app, db);
  registerEvidenceRoutes(app, db);

  return { app, db };
}

export async function startDashboard(config: AppConfig, port: number): Promise<void> {
  const { app, db } = createDashboardApp(config);

  serve({ fetch: app.fetch, port, hostname: "127.0.0.1" });

  console.log(`\n  BrokerBane Dashboard running at:`);
  console.log(`  http://localhost:${port}\n`);
  console.log(`  Press Ctrl+C to stop.\n`);

  const shutdown = () => {
    closeDatabase(db);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
