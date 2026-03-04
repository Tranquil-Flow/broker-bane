import type { Hono } from "hono";
import type { Database } from "better-sqlite3";
import { layout } from "../views/layout.js";

export function registerCompareRoutes(_app: Hono, _db: Database): void {
  _app.get("/compare", (c) => {
    const bodyHtml = `
<div class="content-section">
  <h2>Compare</h2>
  <p>BrokerBane is the only free, open-source, self-hosted option. Your data never leaves your machine.</p>
</div>

<div style="overflow-x:auto">
  <table class="compare-table">
    <thead>
      <tr>
        <th>Feature</th>
        <th class="bb">BrokerBane</th>
        <th>DeleteMe</th>
        <th>Kanary</th>
        <th>Optery</th>
        <th>Privacy Duck</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="feature">Price</td>
        <td class="free">FREE</td>
        <td class="paid">$129/yr</td>
        <td class="paid">$89/yr</td>
        <td class="paid">$249/yr</td>
        <td class="paid">$79/yr</td>
      </tr>
      <tr>
        <td class="feature">Brokers covered</td>
        <td class="yes">1,103</td>
        <td>~580</td>
        <td>~400</td>
        <td>~600</td>
        <td>~200</td>
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
        <td class="feature">Email removal</td>
        <td class="yes">YES</td>
        <td>YES</td>
        <td>YES</td>
        <td>YES</td>
        <td>YES</td>
      </tr>
      <tr>
        <td class="feature">Web form automation</td>
        <td class="yes">YES (AI)</td>
        <td class="no">Manual</td>
        <td class="no">Partial</td>
        <td>YES</td>
        <td class="no">Manual</td>
      </tr>
      <tr>
        <td class="feature">CAPTCHA solving</td>
        <td class="yes">YES</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
      </tr>
      <tr>
        <td class="feature">Inbox monitoring</td>
        <td class="yes">YES</td>
        <td class="no">N/A</td>
        <td class="no">N/A</td>
        <td>YES</td>
        <td class="no">N/A</td>
      </tr>
      <tr>
        <td class="feature">Scheduled re-scan</td>
        <td class="yes">YES</td>
        <td>YES</td>
        <td>YES</td>
        <td>YES</td>
        <td>YES</td>
      </tr>
    </tbody>
  </table>
</div>`;

    return c.html(layout("Compare", "COMPARE", bodyHtml));
  });
}
