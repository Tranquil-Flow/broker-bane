/**
 * Versioned, type-safe payloads carried on retry_queue rows.
 *
 * Each payload variant is tagged by `version` and `kind` so handlers can
 * fail closed on unknown shapes and so future migrations have a stable
 * discriminator to read.
 */

export interface EmailRetryPayloadV1 {
  version: 1;
  kind: "email";
  requestId: number;
  brokerId: string;
  to: string;
  subject?: string;
  body?: string;
  templateName?: string;
  // Audit metadata: the broker-identity id that was active when this retry was
  // enqueued. The retry handler sends and logs under the *current* config's
  // identity so daily-cap accounting and the SMTP auth user stay coherent —
  // identityId is preserved for diagnosing why a retry attributed differently.
  identityId: string;
  createdFrom: "orchestrator" | "manual" | "import";
  originalError?: {
    message: string;
    code?: string;
  };
}

export type RetryPayload = EmailRetryPayloadV1;

const CREATED_FROM_VALUES: ReadonlySet<EmailRetryPayloadV1["createdFrom"]> = new Set([
  "orchestrator",
  "manual",
  "import",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isValidOriginalError(value: unknown): value is EmailRetryPayloadV1["originalError"] {
  if (value === undefined) return true;
  if (!isObject(value)) return false;
  if (typeof value.message !== "string") return false;
  if (value.code !== undefined && typeof value.code !== "string") return false;
  return true;
}

export function isEmailRetryPayloadV1(value: unknown): value is EmailRetryPayloadV1 {
  if (!isObject(value)) return false;
  if (value.version !== 1) return false;
  if (value.kind !== "email") return false;
  if (typeof value.requestId !== "number" || !Number.isInteger(value.requestId) || value.requestId <= 0) {
    return false;
  }
  if (typeof value.brokerId !== "string" || value.brokerId.length === 0) return false;
  if (typeof value.to !== "string" || value.to.length === 0) return false;
  if (typeof value.identityId !== "string" || value.identityId.length === 0) return false;
  if (!isOptionalString(value.subject)) return false;
  if (!isOptionalString(value.body)) return false;
  if (!isOptionalString(value.templateName)) return false;
  if (typeof value.createdFrom !== "string" || !CREATED_FROM_VALUES.has(value.createdFrom as EmailRetryPayloadV1["createdFrom"])) {
    return false;
  }
  if (!isValidOriginalError(value.originalError)) return false;
  return true;
}
