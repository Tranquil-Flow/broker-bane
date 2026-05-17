import type { BatchPreview } from "../../src/pipeline/orchestrator.js";

export function makePreview(overrides: Partial<BatchPreview> = {}): BatchPreview {
  return {
    brokerFacingEmail: "removals@example.invalid",
    identityId: "removals",
    identityMode: "dedicated_mailbox",
    privacyLevel: "maximum",
    dailyLimit: 5,
    sentToday: 2,
    remainingToday: 3,
    limitReached: false,
    totalCandidates: 3,
    validitySkipped: 0,
    today: [
      { id: "alpha", name: "Alpha Broker", method: "email", email: "privacy@alpha.invalid", tier: 1 },
      { id: "beta", name: "Beta Broker", method: "email", email: "privacy@beta.invalid", tier: 1 },
    ],
    notInTodayCount: 1,
    ...overrides,
  };
}
