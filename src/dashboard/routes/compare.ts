import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";

export function registerCompareRoutes(_app: Hono, _db: Database): void {
  _app.get("/compare", (c) => {
    const bodyHtml = `
<div class="content-section">
  <h2>Compare</h2>
  <p>BrokerBane is the only free, open-source, self-hosted data removal tool. Your data never leaves your machine.</p>
</div>

<div class="content-section" style="margin-bottom:1.5rem">
  <h3 style="color:var(--green);margin-bottom:0.5rem">What "brokers covered" means</h3>
  <p style="color:var(--muted);font-size:0.9rem;line-height:1.5">
    Competitor numbers mix different types of coverage. <strong>Automated removals</strong> use pre-built
    integrations with verified opt-out flows. <strong>Custom/manual removals</strong> mean a human (or you)
    submits a request on your behalf &mdash; often with per-plan limits. BrokerBane sends legal removal
    requests (GDPR/CCPA templates) to every broker in its database via email, and supports AI-powered
    web form automation where opt-out forms exist.
  </p>
</div>

<div style="overflow-x:auto">
  <table class="compare-table">
    <thead>
      <tr>
        <th>Feature</th>
        <th class="bb">BrokerBane</th>
        <th>Incogni</th>
        <th>OneRep</th>
        <th>DeleteMe</th>
        <th>Optery</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="feature">Price</td>
        <td class="free">FREE</td>
        <td class="paid">$96/yr</td>
        <td class="paid">$100/yr</td>
        <td class="paid">$129/yr</td>
        <td class="paid">$39&ndash;249/yr</td>
      </tr>
      <tr>
        <td class="feature">Automated removals</td>
        <td>1,103 email + web form</td>
        <td>420+</td>
        <td>313</td>
        <td>85</td>
        <td>130&ndash;400+</td>
      </tr>
      <tr>
        <td class="feature">Custom/manual removals</td>
        <td class="yes">Unlimited (DIY)</td>
        <td>2,000+ sites</td>
        <td>Unlimited</td>
        <td>40&ndash;60 per plan</td>
        <td>Unlimited (Ultimate)</td>
      </tr>
      <tr>
        <td class="feature">Total sites claimed</td>
        <td>1,103</td>
        <td>2,420+</td>
        <td>313</td>
        <td>750+</td>
        <td>950+</td>
      </tr>
      <tr>
        <td class="feature">Data stays local</td>
        <td class="yes">YES</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
      </tr>
      <tr>
        <td class="feature">Open source</td>
        <td class="yes">YES</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
      </tr>
      <tr>
        <td class="feature">Self-hosted</td>
        <td class="yes">YES</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
      </tr>
      <tr>
        <td class="feature">Web form automation</td>
        <td>AI-powered</td>
        <td>YES</td>
        <td>YES</td>
        <td class="no">Manual</td>
        <td>YES</td>
      </tr>
      <tr>
        <td class="feature">Inbox monitoring</td>
        <td class="yes">YES</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
      </tr>
      <tr>
        <td class="feature">Scheduled re-scan</td>
        <td class="yes">YES</td>
        <td>Every 60&ndash;90 days</td>
        <td>Monthly</td>
        <td>Quarterly</td>
        <td>Monthly</td>
      </tr>
      <tr>
        <td class="feature">Before/after proof</td>
        <td class="yes">Screenshots</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td>Screenshots</td>
      </tr>
    </tbody>
  </table>
</div>

<div class="content-section" style="margin-top:1.5rem">
  <p style="color:var(--muted);font-size:0.8rem;line-height:1.5">
    Competitor data sourced from their official websites as of March 2026.
    Incogni: incogni.com | OneRep: onerep.com | DeleteMe: joindeleteme.com | Optery: optery.com.
    "Automated removals" = pre-built integrations. BrokerBane's 1,103 includes email-based legal
    requests and AI-powered web form submissions &mdash; not all have been individually verified.
  </p>
</div>`;

    return c.html(layout("Compare", "COMPARE", bodyHtml));
  });
}
