import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";

export function registerSetupRoutes(_app: Hono, _db: Database): void {
  _app.get("/setup", (c) => {
    const bodyHtml = `
<div class="content-section">
  <h2>Setup wizard &mdash; coming soon</h2>
  <p>For now, configure BrokerBane via the CLI:</p>
<div class="ascii-flow">  $ brokerbane init

  This will guide you through:
    [1] Profile setup (name, email, address)
    [2] Email provider connection (SMTP/OAuth)
    [3] Removal preferences (template, regions, tiers)

  The web-based setup wizard is under development.</div>
</div>`;

    return c.html(layout("Setup", "SETUP", bodyHtml));
  });
}
