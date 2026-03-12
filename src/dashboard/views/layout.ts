const CSS = `/* ========== RESET & BASE ========== */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg:       #0a0a0a;
  --bg-card:  #0f0f0f;
  --bg-hover: #141414;
  --border:   #1a1a1a;
  --green:    #00ff41;
  --green-dim:#00cc33;
  --amber:    #ffb000;
  --red:      #ff0040;
  --cyan:     #00e5ff;
  --text:     #b0b0b0;
  --text-dim: #505050;
  --white:    #e0e0e0;
  --font:     'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
}

html { font-size: 14px; }

body {
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  overflow-x: hidden;
  line-height: 1.6;
}

/* CRT SCANLINE OVERLAY */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 0, 0, 0.08) 2px, rgba(0, 0, 0, 0.08) 4px);
  pointer-events: none;
  z-index: 9999;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%);
  pointer-events: none;
  z-index: 9998;
}

@keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
@keyframes fadeInUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes scanline { 0% { top: -10%; } 100% { top: 110%; } }
@keyframes glow {
  0%, 100% { text-shadow: 0 0 4px var(--green), 0 0 8px rgba(0,255,65,0.3); }
  50% { text-shadow: 0 0 8px var(--green), 0 0 20px rgba(0,255,65,0.5); }
}

.scanline-bar {
  position: fixed; left: 0; width: 100%; height: 4px;
  background: linear-gradient(180deg, transparent, rgba(0,255,65,0.04), transparent);
  animation: scanline 8s linear infinite;
  pointer-events: none; z-index: 9997;
}

.container { max-width: 1200px; margin: 0 auto; padding: 0 1.5rem 4rem; }

header { padding: 2rem 0 1rem; border-bottom: 1px solid var(--border); margin-bottom: 0.5rem; }
.header-top { display: flex; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
.logo { font-size: 1.8rem; font-weight: 700; color: var(--green); letter-spacing: 0.15em; animation: glow 3s ease-in-out infinite; white-space: nowrap; }
.logo .version { font-size: 0.85rem; font-weight: 400; color: var(--text-dim); letter-spacing: 0.05em; }
.cursor { display: inline-block; width: 0.6em; height: 1.2em; background: var(--green); vertical-align: text-bottom; animation: blink 1s step-end infinite; margin-left: 4px; }
.subtitle { color: var(--text-dim); font-size: 0.85rem; font-weight: 300; margin-top: 0.3rem; }

nav { display: flex; gap: 0; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem; overflow-x: auto; scrollbar-width: none; }
nav::-webkit-scrollbar { display: none; }
.nav-tab { padding: 0.75rem 1.25rem; font-size: 0.8rem; font-weight: 500; letter-spacing: 0.1em; color: var(--text-dim); text-decoration: none; border-bottom: 2px solid transparent; white-space: nowrap; transition: color 0.2s, border-color 0.2s; cursor: pointer; position: relative; }
.nav-tab::before { content: '> '; color: var(--text-dim); opacity: 0; transition: opacity 0.2s; }
.nav-tab:hover::before, .nav-tab.active::before { opacity: 1; }
.nav-tab:hover { color: var(--white); }
.nav-tab.active { color: var(--green); border-bottom-color: var(--green); }
.nav-tab.active::before { color: var(--green); }

.stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: var(--bg-card); border: 1px solid var(--border); padding: 1.25rem; position: relative; overflow: hidden; animation: fadeInUp 0.5s ease both; }
.stat-card:nth-child(1) { animation-delay: 0.1s; }
.stat-card:nth-child(2) { animation-delay: 0.2s; }
.stat-card:nth-child(3) { animation-delay: 0.3s; }
.stat-card:nth-child(4) { animation-delay: 0.4s; }
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px; }
.stat-card.targets::before { background: var(--cyan); }
.stat-card.success::before { background: var(--green); }
.stat-card.pending::before { background: var(--amber); }
.stat-card.failed::before { background: var(--red); }
.stat-label { font-size: 0.7rem; letter-spacing: 0.15em; color: var(--text-dim); margin-bottom: 0.5rem; text-transform: uppercase; }
.stat-value { font-size: 2rem; font-weight: 700; line-height: 1; margin-bottom: 0.25rem; }
.stat-card.targets .stat-value { color: var(--cyan); }
.stat-card.success .stat-value { color: var(--green); }
.stat-card.pending .stat-value { color: var(--amber); }
.stat-card.failed .stat-value { color: var(--red); }
.stat-sub { font-size: 0.7rem; color: var(--text-dim); }
.stat-ascii { position: absolute; right: 1rem; bottom: 0.75rem; font-size: 1.8rem; color: var(--border); line-height: 1; opacity: 0.5; }

.progress-section { background: var(--bg-card); border: 1px solid var(--border); padding: 1.25rem; margin-bottom: 1.5rem; animation: fadeInUp 0.5s ease 0.5s both; }
.progress-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.75rem; }
.progress-title { font-size: 0.8rem; letter-spacing: 0.1em; color: var(--white); }
.progress-pct { font-size: 1.2rem; font-weight: 700; color: var(--green); }
.progress-bar-ascii { font-size: 1rem; letter-spacing: 0.05em; line-height: 1.4; margin-bottom: 0.5rem; }
.progress-fill { color: var(--green); }
.progress-empty { color: var(--border); }
.progress-detail { display: flex; gap: 2rem; font-size: 0.7rem; color: var(--text-dim); flex-wrap: wrap; }
.progress-detail .g { color: var(--green-dim); }
.progress-detail .a { color: var(--amber); }
.progress-detail .r { color: var(--red); }

.columns { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
.panel { background: var(--bg-card); border: 1px solid var(--border); animation: fadeInUp 0.5s ease 0.6s both; }
.panel:nth-child(2) { animation-delay: 0.7s; }
.panel-header { display: flex; justify-content: space-between; align-items: center; padding: 0.85rem 1.25rem; border-bottom: 1px solid var(--border); }
.panel-title { font-size: 0.75rem; letter-spacing: 0.15em; color: var(--white); text-transform: uppercase; }
.panel-badge { font-size: 0.65rem; padding: 0.15rem 0.5rem; border: 1px solid var(--text-dim); color: var(--text-dim); letter-spacing: 0.05em; }
.panel-badge.live { border-color: var(--green); color: var(--green); animation: pulse 2s ease-in-out infinite; }
.panel-body { padding: 0; max-height: 340px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
.panel-body::-webkit-scrollbar { width: 4px; }
.panel-body::-webkit-scrollbar-track { background: transparent; }
.panel-body::-webkit-scrollbar-thumb { background: var(--border); }

.log-entry { padding: 0.5rem 1.25rem; font-size: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.02); display: flex; gap: 0.75rem; align-items: flex-start; line-height: 1.5; transition: background 0.15s; }
.log-entry:hover { background: var(--bg-hover); }
.log-time { color: var(--text-dim); white-space: nowrap; flex-shrink: 0; }
.log-icon { flex-shrink: 0; width: 1.2em; text-align: center; }
.log-msg { color: var(--text); }
.log-msg .target { color: var(--white); }
.log-msg .tag { color: var(--text-dim); }
.log-entry.sent .log-icon { color: var(--green); }
.log-entry.confirm .log-icon { color: var(--cyan); }
.log-entry.fail .log-icon { color: var(--red); }
.log-entry.scan .log-icon { color: var(--amber); }
.log-entry.info .log-icon { color: var(--text-dim); }
.log-entry.fail .log-msg .target { color: var(--red); }

.cb-item { padding: 0.85rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; transition: background 0.15s; }
.cb-item:hover { background: var(--bg-hover); }
.cb-left { display: flex; align-items: center; gap: 0.75rem; }
.cb-status { width: 8px; height: 8px; border-radius: 50%; background: var(--red); animation: pulse 1.5s ease-in-out infinite; flex-shrink: 0; }
.cb-status.half-open { background: var(--amber); }
.cb-name { color: var(--white); }
.cb-info { font-size: 0.65rem; color: var(--text-dim); margin-top: 0.15rem; }
.cb-right { text-align: right; }
.cb-timer { font-size: 0.85rem; font-weight: 500; color: var(--red); font-variant-numeric: tabular-nums; }
.cb-timer.half-open { color: var(--amber); }
.cb-label { font-size: 0.6rem; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase; }

.task-item { padding: 0.85rem 1.25rem; border-bottom: 1px solid rgba(255,255,255,0.02); font-size: 0.75rem; transition: background 0.15s; }
.task-item:hover { background: var(--bg-hover); }
.task-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem; }
.task-broker { color: var(--white); }
.task-type { font-size: 0.6rem; letter-spacing: 0.1em; padding: 0.1rem 0.4rem; border: 1px solid; text-transform: uppercase; }
.task-type.captcha { color: var(--amber); border-color: var(--amber); }
.task-type.verify { color: var(--cyan); border-color: var(--cyan); }
.task-type.mail { color: var(--text); border-color: var(--text-dim); }

.task-desc { color: var(--text-dim); line-height: 1.4; }
.task-time { font-size: 0.65rem; color: var(--text-dim); margin-top: 0.3rem; }

.task-actions { margin-top: 0.5rem; }
.task-btn { font-family: var(--font); font-size: 0.65rem; letter-spacing: 0.1em; padding: 0.25rem 0.75rem; background: transparent; color: var(--green); border: 1px solid var(--green); cursor: pointer; text-transform: uppercase; transition: background 0.15s, color 0.15s; }
.task-btn:hover { background: var(--green); color: var(--bg); }

.bottom-section { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }

footer { margin-top: 2rem; padding: 1rem 0; border-top: 1px solid var(--border); font-size: 0.65rem; color: var(--text-dim); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; }
.footer-ascii { letter-spacing: 0.1em; }

.dim { color: var(--text-dim); font-size: 0.75rem; padding: 1.25rem; }

/* Broker table styles */
.broker-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.broker-table th { text-align: left; padding: 0.5rem 1rem; font-size: 0.65rem; letter-spacing: 0.15em; color: var(--text-dim); text-transform: uppercase; border-bottom: 1px solid var(--border); font-weight: 500; }
.broker-table td { padding: 0.5rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.02); color: var(--text); }
.broker-table tr:hover td { background: var(--bg-hover); }
.broker-table .name { color: var(--white); }
.broker-table .status-completed, .broker-table .status-confirmed { color: var(--green); }
.broker-table .status-sent, .broker-table .status-sending, .broker-table .status-awaiting_confirmation, .broker-table .status-scanning, .broker-table .status-matched { color: var(--amber); }
.broker-table .status-failed { color: var(--red); }
.broker-table .status-pending, .broker-table .status-skipped { color: var(--text-dim); }

/* Filter controls */
.filters { display: flex; gap: 1rem; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; align-items: center; }
.filter-select { font-family: var(--font); font-size: 0.7rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 0.35rem 0.5rem; cursor: pointer; }
.filter-select:focus { border-color: var(--green); outline: none; }
.filter-input { font-family: var(--font); font-size: 0.7rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 0.35rem 0.5rem; width: 200px; }
.filter-input:focus { border-color: var(--green); outline: none; }
.filter-input::placeholder { color: var(--text-dim); }

/* About/Compare page styles */
.content-section { margin-bottom: 2rem; }
.content-section h2 { font-size: 0.85rem; letter-spacing: 0.15em; color: var(--green); margin-bottom: 0.75rem; text-transform: uppercase; }
.content-section h2::before { content: '> '; }
.content-section p { color: var(--text); font-size: 0.8rem; line-height: 1.7; margin-bottom: 0.75rem; }
.content-section ul { list-style: none; padding: 0; }
.content-section li { color: var(--text); font-size: 0.8rem; padding: 0.25rem 0; }
.content-section li::before { content: '$ '; color: var(--green-dim); }

.compare-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.compare-table th { text-align: left; padding: 0.6rem 1rem; font-size: 0.65rem; letter-spacing: 0.1em; color: var(--text-dim); text-transform: uppercase; border-bottom: 1px solid var(--border); font-weight: 500; }
.compare-table th.bb { color: var(--green); }
.compare-table td { padding: 0.6rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.02); color: var(--text); }
.compare-table td.feature { color: var(--white); }
.compare-table td.yes { color: var(--green); }
.compare-table td.no { color: var(--text-dim); }
.compare-table td.free { color: var(--green); font-weight: 700; }
.compare-table td.paid { color: var(--red); }
.compare-table tr:hover td { background: var(--bg-hover); }

.ascii-flow { color: var(--green-dim); font-size: 0.8rem; padding: 1rem; background: var(--bg); border: 1px solid var(--border); margin: 1rem 0; white-space: pre; overflow-x: auto; }

/* ========== SETUP WIZARD ========== */
.wizard-progress { display: flex; align-items: center; gap: 0; padding: 1rem 1.25rem; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.wizard-step { font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.25rem 0.5rem; color: var(--text-dim); white-space: nowrap; }
.wizard-step.completed { color: var(--green-dim); }
.wizard-step.active { color: var(--green); font-weight: 700; }
.wizard-sep { color: var(--text-dim); font-size: 0.65rem; padding: 0 0.25rem; }
.wizard-body { padding: 1.5rem 1.25rem; }
.wizard-body h3 { color: var(--white); font-size: 0.8rem; letter-spacing: 0.1em; margin-bottom: 1rem; }
.wizard-body h3::before { content: '> '; color: var(--green); }
.wizard-section { margin-bottom: 1.5rem; padding-bottom: 1.5rem; border-bottom: 1px dashed var(--border); }
.wizard-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.wizard-field { margin-bottom: 0.75rem; }
.wizard-field label { display: block; font-size: 0.7rem; letter-spacing: 0.1em; color: var(--text-dim); text-transform: uppercase; margin-bottom: 0.25rem; }
.wizard-field input[type="text"],
.wizard-field input[type="email"],
.wizard-field input[type="password"],
.wizard-field input[type="number"],
.wizard-field select { width: 100%; font-family: var(--font); font-size: 0.75rem; background: var(--bg); color: var(--text); border: 1px solid var(--border); padding: 0.5rem; }
.wizard-field input:focus, .wizard-field select:focus { border-color: var(--green); outline: none; color: var(--white); }
.wizard-field .field-error { color: var(--red); font-size: 0.65rem; margin-top: 0.25rem; }
.wizard-field .field-hint { color: var(--text-dim); font-size: 0.65rem; margin-top: 0.25rem; }
.wizard-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.wizard-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem; }
.wizard-btn { font-family: var(--font); font-size: 0.7rem; letter-spacing: 0.1em; padding: 0.5rem 1.25rem; background: transparent; color: var(--green); border: 1px solid var(--green); text-transform: uppercase; cursor: pointer; transition: background 0.15s, color 0.15s; text-decoration: none; display: inline-block; }
.wizard-btn:hover { background: var(--green); color: var(--bg); }
.wizard-btn.secondary { color: var(--text-dim); border-color: var(--text-dim); }
.wizard-btn.secondary:hover { background: var(--text-dim); color: var(--bg); }
.wizard-btn.oauth { color: var(--cyan); border-color: var(--cyan); }
.wizard-btn.oauth:hover { background: var(--cyan); color: var(--bg); }
.wizard-radio { margin-bottom: 0.5rem; }
.wizard-radio input[type="radio"] { accent-color: var(--green); margin-right: 0.5rem; }
.wizard-radio label { font-size: 0.75rem; color: var(--text); cursor: pointer; }
.wizard-radio .radio-hint { font-size: 0.65rem; color: var(--text-dim); margin-left: 1.5rem; }
.wizard-check { margin-bottom: 0.5rem; }
.wizard-check input[type="checkbox"] { accent-color: var(--green); margin-right: 0.5rem; }
.wizard-check label { font-size: 0.75rem; color: var(--text); cursor: pointer; }
.wizard-alert { padding: 0.75rem; border: 1px solid var(--border); font-size: 0.7rem; margin-bottom: 1rem; }
.wizard-alert.info { border-color: var(--cyan); color: var(--cyan); }
.wizard-alert.warn { border-color: var(--amber); color: var(--amber); }
.wizard-alert.error { border-color: var(--red); color: var(--red); }
.wizard-alert.success { border-color: var(--green); color: var(--green); }
.wizard-alert a { color: inherit; }
.wizard-divider { border: none; border-top: 1px dashed var(--border); margin: 1rem 0; }
.wizard-summary dt { font-size: 0.65rem; letter-spacing: 0.1em; color: var(--text-dim); text-transform: uppercase; margin-top: 0.5rem; }
.wizard-summary dd { font-size: 0.75rem; color: var(--green); margin-bottom: 0.5rem; }
.wizard-test-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0; font-size: 0.75rem; }
.wizard-test-row .test-label { color: var(--text-dim); min-width: 4rem; text-transform: uppercase; font-size: 0.65rem; letter-spacing: 0.1em; }
.wizard-test-row .test-pass { color: var(--green); }
.wizard-test-row .test-fail { color: var(--red); }
.wizard-test-row .test-loading { color: var(--amber); }

@media (max-width: 550px) {
  .wizard-row { grid-template-columns: 1fr; }
}

@media (max-width: 900px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .columns, .bottom-section { grid-template-columns: 1fr; }
}
@media (max-width: 550px) {
  html { font-size: 12px; }
  .stats-grid { grid-template-columns: 1fr; }
  .header-meta { flex-direction: column; gap: 0.25rem; }
  .progress-detail { flex-direction: column; gap: 0.25rem; }
}`;

interface NavItem {
  href: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "DASHBOARD" },
  { href: "/scan", label: "SCAN" },
  { href: "/brokers", label: "BROKERS" },
  { href: "/tasks", label: "TASKS" },
  { href: "/evidence", label: "EVIDENCE" },
  { href: "/about", label: "INTEL" },
  { href: "/compare", label: "COMPARE" },
  { href: "/setup", label: "SETUP" },
  { href: "/settings", label: "SETTINGS" },
];

export function layout(title: string, activeNav: string, bodyHtml: string): string {
  const navHtml = NAV_ITEMS.map(
    (item) =>
      `<a href="${item.href}" class="nav-tab${item.label === activeNav ? " active" : ""}">${item.label}</a>`
  ).join("\n    ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - BrokerBane</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="scanline-bar"></div>
  <div class="container">
    <header>
      <div class="header-top">
        <div class="logo">BROKERBANE <span class="version">v1.0.0</span><span class="cursor"></span></div>
      </div>
      <div class="subtitle">// your data. your rules.</div>
    </header>
    <nav>
    ${navHtml}
    </nav>
    ${bodyHtml}
    <footer>
      <span class="footer-ascii">[ BROKERBANE ] &mdash; PII never leaves this machine</span>
      <span>ALL OPERATIONS LOCAL // AGPL-3.0</span>
    </footer>
  </div>
  <script src="/assets/htmx.min.js"></script>
</body>
</html>`;
}
