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
    Competitors often inflate coverage by counting websites instead of unique brokers &mdash;
    one broker can operate many domains. All numbers below are counted by unique data broker.
    <strong>Email removals</strong> send legal requests (GDPR/CCPA) directly to the broker.
    <strong>Web form removals</strong> automate the broker's online opt-out form.
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
        <td class="feature">Total brokers in scope</td>
        <td class="yes">1,169</td>
        <td>420+</td>
        <td>313</td>
        <td>750+</td>
        <td>950+</td>
      </tr>
      <tr>
        <td class="feature">Email removals</td>
        <td class="yes">YES</td>
        <td>YES</td>
        <td>YES</td>
        <td>YES</td>
        <td>YES</td>
      </tr>
      <tr>
        <td class="feature">Web form removals</td>
        <td class="yes">Scripted + AI fallback</td>
        <td>Scripted</td>
        <td>Scripted</td>
        <td class="no">Manual</td>
        <td>Scripted</td>
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
        <td class="feature">Inbox monitoring</td>
        <td class="yes">YES</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
        <td class="no">NO</td>
      </tr>
      <tr>
        <td class="feature">Scheduled re-scan</td>
        <td class="yes">Custom (daily&ndash;yearly)</td>
        <td>Every 60&ndash;90 days</td>
        <td>Monthly</td>
        <td>Quarterly</td>
        <td>Monthly</td>
      </tr>
      <tr>
        <td class="feature">Before/after proof</td>
        <td class="yes">SHA-256 cryptographic chain</td>
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
    Incogni claims 2,420+ "sites" but counts multiple domains per broker &mdash; their verified
    unique broker count is 420+. BrokerBane's 1,169 includes email-based legal requests and
    automated web form submissions &mdash; not all have been individually verified.
  </p>
</div>`;

    return c.html(layout("Compare", "COMPARE", bodyHtml));
  });
}
