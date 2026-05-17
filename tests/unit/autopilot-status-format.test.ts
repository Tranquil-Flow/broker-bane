import { describe, expect, it } from "vitest";
import { formatAutopilotStatus } from "../../src/commands/autopilot-status-format.js";
import { makePreview as preview } from "../fixtures/preview.js";

describe("formatAutopilotStatus", () => {
  it("includes the broker-facing mailbox, identity mode and daily cap", () => {
    const out = formatAutopilotStatus({ preview: preview(), retryPending: 0, retryReady: 0 });
    expect(out).toContain("Broker-facing mailbox: removals@example.invalid");
    expect(out).toContain("Identity mode:          dedicated_mailbox (maximum)");
    expect(out).toContain("Daily cap:              5");
    expect(out).toContain("Sent today:             2");
    expect(out).toContain("Remaining today:        3");
  });

  it("reports pending and ready retry counts", () => {
    const out = formatAutopilotStatus({ preview: preview(), retryPending: 7, retryReady: 3 });
    expect(out).toContain("Retry queue pending:    7");
    expect(out).toContain("Retry queue ready:      3");
  });

  it("shows the same-mailbox warning when identityMode is same_mailbox", () => {
    const out = formatAutopilotStatus({
      preview: preview({ identityMode: "same_mailbox", privacyLevel: "legacy" }),
      retryPending: 0,
      retryReady: 0,
    });
    expect(out).toContain("Using your personal mailbox for broker contact leaks metadata");
    expect(out).toContain("brokerbane init");
  });

  it("omits the same-mailbox warning under dedicated_mailbox mode", () => {
    const out = formatAutopilotStatus({ preview: preview(), retryPending: 0, retryReady: 0 });
    expect(out).not.toContain("personal mailbox");
  });

  it("prints the daily-cap-reached message when limitReached is true", () => {
    const out = formatAutopilotStatus({
      preview: preview({ limitReached: true, remainingToday: 0, sentToday: 5, today: [] }),
      retryPending: 0,
      retryReady: 0,
    });
    expect(out).toContain("Daily cap is reached");
  });

  it("lists up to ten brokers in today's batch", () => {
    const today = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      name: `Broker ${i}`,
      method: "email" as const,
      email: `privacy@b${i}.invalid`,
      tier: 1 as const,
    }));
    const out = formatAutopilotStatus({
      preview: preview({ today, totalCandidates: 12, remainingToday: 12, dailyLimit: 12 }),
      retryPending: 0,
      retryReady: 0,
    });
    expect(out).toContain("1. Broker 0 (b0) — email");
    expect(out).toContain("10. Broker 9 (b9) — email");
    expect(out).not.toContain("11. Broker 10");
    expect(out).toContain("...and 2 more in today's cap");
  });

  it("ends with the next-command suggestion", () => {
    const out = formatAutopilotStatus({ preview: preview(), retryPending: 0, retryReady: 0 });
    expect(out).toContain("Next: brokerbane autopilot start --once --test-mode");
  });

  it("does not leak sensitive profile fields (address, phone, DOB)", () => {
    const out = formatAutopilotStatus({ preview: preview(), retryPending: 0, retryReady: 0 });
    expect(out.toLowerCase()).not.toContain("street");
    expect(out.toLowerCase()).not.toContain("phone");
    expect(out.toLowerCase()).not.toContain("dob");
    expect(out.toLowerCase()).not.toContain("date_of_birth");
  });
});
