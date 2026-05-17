import type { BatchPreview } from "../pipeline/orchestrator.js";

export interface FormatAutopilotStatusInput {
  preview: BatchPreview;
  retryPending: number;
  retryReady: number;
}

const DIVIDER = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

export function formatAutopilotStatus({ preview, retryPending, retryReady }: FormatAutopilotStatusInput): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(DIVIDER);
  lines.push("  BrokerBane Autopilot Status");
  lines.push(`${DIVIDER}\n`);
  lines.push(`  Broker-facing mailbox: ${preview.brokerFacingEmail}`);
  lines.push(`  Identity mode:          ${preview.identityMode} (${preview.privacyLevel})`);
  lines.push(`  Daily cap:              ${preview.dailyLimit ?? "unlimited"}`);
  lines.push(`  Sent today:             ${preview.sentToday}`);
  lines.push(`  Remaining today:        ${preview.remainingToday}`);
  lines.push(`  Today's broker batch:   ${preview.today.length}`);
  lines.push(`  Later candidates:       ${preview.notInTodayCount}`);
  lines.push(`  Retry queue pending:    ${retryPending}`);
  lines.push(`  Retry queue ready:      ${retryReady}`);

  if (preview.identityMode === "same_mailbox") {
    lines.push("");
    lines.push("  ⚠  Using your personal mailbox for broker contact leaks metadata.");
    lines.push("     Consider configuring a dedicated removal mailbox via `brokerbane init`.");
  }

  if (preview.limitReached) {
    lines.push("");
    lines.push("  Daily cap is reached. Autopilot will wait before sending more email.");
  } else if (preview.today.length === 0) {
    lines.push("");
    lines.push("  No broker email batch is ready right now.");
  } else {
    lines.push("");
    lines.push("  Next brokers in the capped batch:");
    preview.today.slice(0, 10).forEach((broker, index) => {
      lines.push(`    ${index + 1}. ${broker.name} (${broker.id}) — ${broker.method}`);
    });
    if (preview.today.length > 10) {
      lines.push(`    ...and ${preview.today.length - 10} more in today's cap.`);
    }
  }

  lines.push("");
  lines.push("  Next: brokerbane autopilot start --once --test-mode");
  lines.push("");

  return lines.join("\n");
}
