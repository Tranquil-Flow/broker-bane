import { describe, it, expect } from "vitest";
import { isEmailRetryPayloadV1, type EmailRetryPayloadV1 } from "../../src/pipeline/retry-payloads.js";

const valid: EmailRetryPayloadV1 = {
  version: 1,
  kind: "email",
  requestId: 42,
  brokerId: "email-basic",
  to: "privacy@email-basic.example.invalid",
  identityId: "broker-facing-removals",
  createdFrom: "orchestrator",
};

describe("isEmailRetryPayloadV1", () => {
  it("accepts a minimal valid payload", () => {
    expect(isEmailRetryPayloadV1(valid)).toBe(true);
  });

  it("accepts a payload with optional fields populated", () => {
    expect(
      isEmailRetryPayloadV1({
        ...valid,
        subject: "Removal request",
        body: "Hi",
        templateName: "gdpr",
        originalError: { message: "ESMTP timeout", code: "ETIMEDOUT" },
      })
    ).toBe(true);
  });

  it("rejects wrong version", () => {
    expect(isEmailRetryPayloadV1({ ...valid, version: 2 })).toBe(false);
  });

  it("rejects wrong kind", () => {
    expect(isEmailRetryPayloadV1({ ...valid, kind: "web_form" })).toBe(false);
  });

  it("rejects missing requestId", () => {
    const { requestId: _omit, ...rest } = valid;
    expect(isEmailRetryPayloadV1(rest)).toBe(false);
  });

  it("rejects non-integer requestId", () => {
    expect(isEmailRetryPayloadV1({ ...valid, requestId: 3.5 })).toBe(false);
  });

  it("rejects non-positive requestId", () => {
    expect(isEmailRetryPayloadV1({ ...valid, requestId: 0 })).toBe(false);
  });

  it("rejects missing brokerId", () => {
    const { brokerId: _omit, ...rest } = valid;
    expect(isEmailRetryPayloadV1(rest)).toBe(false);
  });

  it("rejects empty brokerId", () => {
    expect(isEmailRetryPayloadV1({ ...valid, brokerId: "" })).toBe(false);
  });

  it("rejects missing to address", () => {
    const { to: _omit, ...rest } = valid;
    expect(isEmailRetryPayloadV1(rest)).toBe(false);
  });

  it("rejects missing identityId", () => {
    const { identityId: _omit, ...rest } = valid;
    expect(isEmailRetryPayloadV1(rest)).toBe(false);
  });

  it("rejects unknown createdFrom", () => {
    expect(isEmailRetryPayloadV1({ ...valid, createdFrom: "scheduler" })).toBe(false);
  });

  it("rejects malformed originalError", () => {
    expect(isEmailRetryPayloadV1({ ...valid, originalError: { code: "X" } })).toBe(false);
    expect(isEmailRetryPayloadV1({ ...valid, originalError: "boom" })).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(isEmailRetryPayloadV1(null)).toBe(false);
    expect(isEmailRetryPayloadV1(undefined)).toBe(false);
    expect(isEmailRetryPayloadV1("string")).toBe(false);
    expect(isEmailRetryPayloadV1(42)).toBe(false);
  });
});
