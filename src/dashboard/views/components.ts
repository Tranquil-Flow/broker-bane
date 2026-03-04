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
    <span>${queued} queued</span>
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
