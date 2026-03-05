export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function statCard(
  label: string,
  value: string | number,
  cssClass: string,
  sub: string,
  icon: string,
): string {
  return `<div class="stat-card ${escapeHtml(cssClass)}">
  <div class="stat-label">${escapeHtml(label)}</div>
  <div class="stat-value">${escapeHtml(String(value))}</div>
  <div class="stat-sub">${escapeHtml(sub)}</div>
  <div class="stat-ascii">${escapeHtml(icon)}</div>
</div>`;
}

export function progressBar(
  completed: number,
  total: number,
  inProgress: number,
  failed: number,
  queued: number,
): string {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const barWidth = 40;
  const filled = total > 0 ? Math.round((completed / total) * barWidth) : 0;
  const fillStr = "\u2588".repeat(filled);
  const emptyStr = "\u2591".repeat(barWidth - filled);

  return `<div class="progress-section">
  <div class="progress-header">
    <span class="progress-title">REMOVAL PROGRESS</span>
    <span class="progress-pct">${pct}%</span>
  </div>
  <div class="progress-bar-ascii">[<span class="progress-fill">${fillStr}</span><span class="progress-empty">${emptyStr}</span>]</div>
  <div class="progress-detail">
    <span><span class="g">${completed}</span> completed</span>
    <span><span class="a">${inProgress}</span> in progress</span>
    <span><span class="r">${failed}</span> failed</span>
    <span>${queued} remaining</span>
  </div>
</div>`;
}

function statusToLogClass(status: string): string {
  switch (status) {
    case "sent":
    case "completed":
    case "confirmed":
      return "sent";
    case "awaiting_confirmation":
      return "confirm";
    case "failed":
      return "fail";
    case "scanning":
    case "matched":
      return "scan";
    default:
      return "info";
  }
}

function statusToIcon(status: string): string {
  switch (status) {
    case "sent":
    case "completed":
    case "confirmed":
      return "[+]";
    case "awaiting_confirmation":
      return "[?]";
    case "failed":
      return "[!]";
    case "scanning":
    case "matched":
      return "[~]";
    default:
      return "[-]";
  }
}

export function logEntry(
  timestamp: string,
  status: string,
  brokerId: string,
  method: string,
  error: string | null,
): string {
  const cls = statusToLogClass(status);
  const icon = statusToIcon(status);
  const msg = error
    ? `<span class="target">${escapeHtml(brokerId)}</span> <span class="tag">[${escapeHtml(method)}]</span> ${escapeHtml(error)}`
    : `<span class="target">${escapeHtml(brokerId)}</span> <span class="tag">[${escapeHtml(method)}]</span> ${escapeHtml(status)}`;

  return `<div class="log-entry ${cls}">
  <span class="log-time">${escapeHtml(timestamp)}</span>
  <span class="log-icon">${icon}</span>
  <span class="log-msg">${msg}</span>
</div>`;
}

export function circuitBreakerCard(
  brokerId: string,
  state: string,
  failureCount: number,
  cooldownUntil: string | null,
): string {
  const isHalfOpen = state === "half_open";
  const statusClass = isHalfOpen ? "half-open" : "";
  const timerClass = isHalfOpen ? "half-open" : "";
  const timerText = cooldownUntil ?? "--:--";
  const stateLabel = isHalfOpen ? "HALF-OPEN" : "OPEN";

  return `<div class="cb-item">
  <div class="cb-left">
    <div class="cb-status ${statusClass}"></div>
    <div>
      <div class="cb-name">${escapeHtml(brokerId)}</div>
      <div class="cb-info">${failureCount} failures &middot; ${escapeHtml(stateLabel)}</div>
    </div>
  </div>
  <div class="cb-right">
    <div class="cb-timer ${timerClass}">${escapeHtml(timerText)}</div>
    <div class="cb-label">cooldown</div>
  </div>
</div>`;
}

function taskTypeClass(taskType: string): string {
  if (taskType.includes("captcha")) return "captcha";
  if (taskType.includes("verify") || taskType.includes("confirm") || taskType.includes("review")) return "verify";
  return "mail";
}

export function taskCard(
  id: number,
  taskType: string,
  description: string,
  brokerId: string,
  url: string | null,
  createdAt: string,
): string {
  const typeCls = taskTypeClass(taskType);
  const urlHtml = url
    ? ` &middot; <a href="${escapeHtml(url)}" target="_blank" style="color:var(--cyan)">${escapeHtml(url)}</a>`
    : "";

  return `<div class="task-item">
  <div class="task-top">
    <span class="task-broker">${escapeHtml(brokerId)}</span>
    <span class="task-type ${typeCls}">${escapeHtml(taskType)}</span>
  </div>
  <div class="task-desc">${escapeHtml(description)}${urlHtml}</div>
  <div class="task-time">${escapeHtml(createdAt)}</div>
  <div class="task-actions">
    <button class="task-btn" hx-post="/api/tasks/${id}/complete" hx-swap="outerHTML" hx-target="closest .task-item">MARK DONE</button>
  </div>
</div>`;
}

// ─── Scan Components ──────────────────────────────────────────────

export function scanSummaryCard(
  lastScanDate: string,
  status: string,
  foundCount: number,
  notFoundCount: number,
  errorCount: number,
  foundBrokerIds: string[],
): string {
  const statusColor = status === "completed" ? "var(--green)" : status === "failed" ? "var(--red)" : "var(--amber)";
  const total = foundCount + notFoundCount + errorCount;

  let foundListHtml = "";
  if (foundBrokerIds.length > 0) {
    foundListHtml = `<div style="margin-top:0.5rem;font-size:0.7rem">
  <span style="color:var(--red)">Found on:</span>
  ${foundBrokerIds.map((id) => `<span class="task-type captcha" style="margin:0.1rem">${escapeHtml(id)}</span>`).join(" ")}
</div>`;
  }

  return `<div style="background:var(--bg-card);border:1px solid var(--border);padding:1.25rem;margin-bottom:1rem">
  <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:0.5rem">
    <span style="font-size:0.75rem;letter-spacing:0.1em;color:var(--white)">SINCE YOU LAST CHECKED IN</span>
    <span style="font-size:0.65rem;color:var(--text-dim)">${escapeHtml(lastScanDate)}</span>
  </div>
  <div style="display:flex;gap:2rem;font-size:0.8rem">
    <span><span style="color:${statusColor};font-weight:700">${total}</span> scanned</span>
    <span><span style="color:var(--red);font-weight:700">${foundCount}</span> found</span>
    <span><span style="color:var(--green);font-weight:700">${notFoundCount}</span> clean</span>
    ${errorCount > 0 ? `<span><span style="color:var(--amber)">${errorCount}</span> errors</span>` : ""}
  </div>
  ${foundListHtml}
</div>`;
}

export function exposureListItem(
  brokerName: string,
  brokerId: string,
  found: boolean,
  error: string | null,
  timestamp: string,
): string {
  const icon = found ? "[!]" : error ? "[?]" : "[+]";
  const iconColor = found ? "var(--red)" : error ? "var(--amber)" : "var(--green)";
  const statusText = found ? "FOUND" : error ? escapeHtml(error).slice(0, 60) : "CLEAN";

  return `<div class="log-entry" style="display:flex;gap:0.75rem;align-items:center">
  <span style="color:${iconColor};flex-shrink:0">${icon}</span>
  <span class="target" style="min-width:160px">${escapeHtml(brokerName)}</span>
  <span style="color:var(--text-dim);font-size:0.65rem">${escapeHtml(brokerId)}</span>
  <span style="color:${iconColor};margin-left:auto;font-size:0.65rem;letter-spacing:0.1em">${statusText}</span>
  <span class="log-time">${escapeHtml(timestamp)}</span>
</div>`;
}

// ─── Evidence Components ──────────────────────────────────────────

export function evidenceStatusBadge(
  valid: boolean,
  totalEntries: number,
  brokenAt?: number,
): string {
  if (totalEntries === 0) {
    return `<div style="background:var(--bg-card);border:1px solid var(--border);padding:1rem;display:flex;align-items:center;gap:0.75rem">
  <span style="color:var(--text-dim);font-size:0.8rem">[~]</span>
  <span style="font-size:0.75rem;color:var(--text-dim)">No evidence chain entries</span>
</div>`;
  }

  if (valid) {
    return `<div style="background:var(--bg-card);border:1px solid var(--green);padding:1rem;display:flex;align-items:center;gap:0.75rem">
  <span style="color:var(--green);font-size:0.8rem">[+]</span>
  <span style="font-size:0.75rem;color:var(--green)">CHAIN VALID</span>
  <span style="font-size:0.65rem;color:var(--text-dim);margin-left:auto">${totalEntries} entries verified</span>
</div>`;
  }

  return `<div style="background:var(--bg-card);border:1px solid var(--red);padding:1rem;display:flex;align-items:center;gap:0.75rem">
  <span style="color:var(--red);font-size:0.8rem">[!]</span>
  <span style="font-size:0.75rem;color:var(--red)">CHAIN BROKEN</span>
  <span style="font-size:0.65rem;color:var(--text-dim);margin-left:auto">Break at entry #${brokenAt} of ${totalEntries}</span>
</div>`;
}

export function evidenceEntryCard(
  entryType: string,
  contentHash: string,
  prevHash: string,
  screenshotPath: string | null,
  createdAt: string,
): string {
  const typeLabel = entryType.replace(/_/g, " ").toUpperCase();
  const typeColor = entryType === "before_scan" ? "var(--amber)"
    : entryType === "after_removal" ? "var(--green)"
    : entryType === "re_verification" ? "var(--cyan)"
    : "var(--text)";

  const hashShort = contentHash.slice(0, 16) + "...";
  const prevShort = prevHash === "0".repeat(64) ? "GENESIS" : prevHash.slice(0, 16) + "...";

  return `<div class="log-entry" style="display:block;padding:0.75rem 1.25rem">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
    <span style="color:${typeColor};font-size:0.65rem;letter-spacing:0.1em;border:1px solid ${typeColor};padding:0.1rem 0.4rem">${typeLabel}</span>
    <span class="log-time">${escapeHtml(createdAt)}</span>
  </div>
  <div style="font-size:0.65rem;color:var(--text-dim);margin-top:0.3rem">
    <span>hash: <span style="color:var(--cyan)">${hashShort}</span></span>
    <span style="margin-left:1rem">prev: <span style="color:var(--text)">${prevShort}</span></span>
    ${screenshotPath ? `<span style="margin-left:1rem;color:var(--green)">[screenshot]</span>` : ""}
  </div>
</div>`;
}

export function beforeAfterScreenshots(
  beforePath: string | null,
  afterPath: string | null,
): string {
  return `<div class="panel" style="margin-top:1.5rem">
  <div class="panel-header">
    <span class="panel-title">Before / After Screenshots</span>
    <span class="panel-badge">EVIDENCE</span>
  </div>
  <div class="panel-body" style="padding:1rem;display:grid;grid-template-columns:1fr 1fr;gap:1rem">
    <div>
      <div style="font-size:0.65rem;letter-spacing:0.1em;color:var(--amber);margin-bottom:0.5rem">BEFORE (LISTING FOUND)</div>
      ${beforePath
        ? `<div style="font-size:0.7rem;color:var(--text-dim);word-break:break-all">${escapeHtml(beforePath)}</div>`
        : `<div class="dim">No screenshot</div>`}
    </div>
    <div>
      <div style="font-size:0.65rem;letter-spacing:0.1em;color:var(--green);margin-bottom:0.5rem">AFTER (REMOVED)</div>
      ${afterPath
        ? `<div style="font-size:0.7rem;color:var(--text-dim);word-break:break-all">${escapeHtml(afterPath)}</div>`
        : `<div class="dim">No screenshot</div>`}
    </div>
  </div>
</div>`;
}

// ─── Category Breakdown ───────────────────────────────────────────

export function categoryBreakdownBar(
  categories: { name: string; count: number }[],
  total: number,
): string {
  const colorMap: Record<string, string> = {
    people_search: "var(--red)",
    data_broker: "var(--amber)",
    marketing_data: "var(--cyan)",
    background_check: "var(--magenta, #b48ead)",
    credit_bureau: "var(--yellow, #ebcb8b)",
  };

  const bars = categories
    .sort((a, b) => b.count - a.count)
    .map((cat) => {
      const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0;
      const color = colorMap[cat.name] ?? "var(--text-dim)";
      const label = cat.name.replace(/_/g, " ").toUpperCase();
      return `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.7rem">
  <span style="min-width:120px;letter-spacing:0.05em;color:${color}">${label}</span>
  <div style="flex:1;background:var(--bg-card);height:12px;border:1px solid var(--border);position:relative">
    <div style="width:${pct}%;height:100%;background:${color};opacity:0.7"></div>
  </div>
  <span style="min-width:50px;text-align:right;color:var(--text-dim)">${cat.count} <span style="font-size:0.6rem">(${pct}%)</span></span>
</div>`;
    })
    .join("\n");

  return `<div style="background:var(--bg-card);border:1px solid var(--border);padding:1rem 1.25rem;margin-bottom:1rem">
  <div style="font-size:0.7rem;letter-spacing:0.1em;color:var(--white);margin-bottom:0.75rem">BROKER CATEGORIES</div>
  <div style="display:flex;flex-direction:column;gap:0.4rem">
    ${bars}
  </div>
</div>`;
}

// ─── Broker Table ─────────────────────────────────────────────────

export function brokerTableRow(
  name: string,
  domain: string,
  category: string,
  region: string,
  tier: number,
  method: string,
  difficulty: string,
  status: string,
  lastAction: string,
): string {
  const statusClass = `status-${status.replace(/\s+/g, "_")}`;

  return `<tr>
  <td class="name">${escapeHtml(name)}</td>
  <td>${escapeHtml(domain)}</td>
  <td>${escapeHtml(category)}</td>
  <td>${escapeHtml(region)}</td>
  <td>${tier}</td>
  <td>${escapeHtml(method)}</td>
  <td>${escapeHtml(difficulty)}</td>
  <td class="${statusClass}">${escapeHtml(status)}</td>
  <td>${escapeHtml(lastAction)}</td>
</tr>`;
}
