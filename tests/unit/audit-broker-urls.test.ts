import { describe, expect, it } from "vitest";
import { collectAuditTargets, collectMissingOptOutBrokers } from "../../scripts/audit-broker-urls.js";

describe("broker URL audit helpers", () => {
  const brokers = [
    {
      id: "email-only",
      name: "Email Only",
      tier: 1,
      domain: "email.example",
      removal_method: "email",
      email: "privacy@email.example",
    },
    {
      id: "web-missing",
      name: "Web Missing",
      tier: 1,
      domain: "web.example",
      removal_method: "web_form",
    },
    {
      id: "hybrid-missing",
      name: "Hybrid Missing",
      tier: 2,
      domain: "hybrid.example",
      removal_method: "hybrid",
      email: "privacy@hybrid.example",
    },
    {
      id: "web-covered",
      name: "Web Covered",
      tier: 1,
      domain: "covered.example",
      removal_method: "web_form",
      opt_out_url: "https://covered.example/optout",
    },
  ];

  it("collects URL audit targets for fields that exist", () => {
    expect(collectAuditTargets(brokers, 1).map(t => `${t.brokerId}:${t.kind}`)).toEqual([
      "email-only:domain",
      "web-missing:domain",
      "web-covered:opt_out_url",
      "web-covered:domain",
    ]);
  });

  it("reports only web-form-capable brokers that are missing opt-out URLs", () => {
    expect(collectMissingOptOutBrokers(brokers).map(b => b.id)).toEqual([
      "web-missing",
      "hybrid-missing",
    ]);
  });

  it("can scope missing opt-out reporting by tier and limit", () => {
    expect(collectMissingOptOutBrokers(brokers, 1, 1).map(b => b.id)).toEqual(["web-missing"]);
  });
});
