import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";

export function registerAboutRoutes(_app: Hono, _db: Database): void {
  _app.get("/about", (c) => {
    const bodyHtml = `
<div class="content-section">
  <h2>What are data brokers?</h2>
  <p>Data brokers are companies that collect, aggregate, and sell your personal information &mdash; names, addresses, phone numbers, email addresses, employment history, and more. They scrape public records, purchase data from apps and websites, and build detailed profiles that anyone can buy. There are over 4,000 data brokers operating worldwide.</p>
</div>

<div class="content-section">
  <h2>What does BrokerBane do?</h2>
  <p>BrokerBane automates the tedious process of requesting data removal from these brokers. It sends GDPR Article 17 and CCPA Section 1798.105 erasure requests via email, monitors your inbox for confirmation emails, and automatically clicks verification links. For brokers that require web forms, BrokerBane uses preconfigured playbooks for each broker, with AI-powered repair when forms change.</p>
</div>

<div class="content-section">
  <h2>How it works</h2>
<div class="ascii-flow">  SCAN ──&gt; SEND ──&gt; MONITOR ──&gt; CONFIRM ──&gt; DONE
   │         │         │           │          │
   │         │         │           │          └─ Removal verified
   │         │         │           └─ Auto-click confirmation links
   │         │         └─ IMAP IDLE inbox monitoring
   │         └─ Email (SMTP) or web form (playbook + AI repair)
   └─ Check if profile exists on broker</div>
</div>

<div class="content-section">
  <h2>Privacy guarantees</h2>
  <p>All data stays on your machine. BrokerBane never sends your personal information to any server except the broker being contacted. Config files are stored with 0600 permissions. PII is redacted from all logs. The tool works without any cloud services.</p>
</div>

<div class="content-section">
  <h2>Open source</h2>
  <p>BrokerBane is free and open source under AGPL-3.0. Contributions welcome.</p>
</div>`;

    return c.html(layout("Intel", "INTEL", bodyHtml));
  });
}
