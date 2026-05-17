import type { Broker } from "../types/broker.js";
import { EmailError } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { RETRY_TASK_TYPE } from "../db/repositories/retry-queue.repo.js";
import { extractErrorInfo, type RetryQueue } from "./retry-queue.js";
import type { EmailRetryPayloadV1 } from "./retry-payloads.js";

export interface EnqueueEmailRetryParams {
  queue: RetryQueue;
  broker: Broker;
  requestId: number;
  identityId: string;
  rendered: { subject: string; body: string };
  templateName: string;
  dryRun: boolean;
  error: unknown;
}

/**
 * Wraps RetryQueue.enqueueIfTransient with the orchestrator-specific concerns:
 *
 *  - Skipped entirely in dry-run mode (no durable side effect on disk).
 *  - Unwraps EmailError so the underlying nodemailer/socket error code is
 *    visible to the transient classifier.
 *  - Builds a versioned EmailRetryPayloadV1 from the already-rendered email so
 *    the retry handler can resend without recomputing.
 *
 * Returns true when a retry row was queued, false otherwise.
 */
export function enqueueEmailRetryIfTransient(params: EnqueueEmailRetryParams): boolean {
  const { queue, broker, requestId, identityId, rendered, templateName, dryRun, error } = params;

  if (dryRun) {
    logger.debug({ brokerId: broker.id }, "Skipping retry enqueue in dry-run mode");
    return false;
  }

  if (!broker.email) {
    logger.debug({ brokerId: broker.id }, "Skipping retry enqueue — broker has no email address");
    return false;
  }

  const underlying = error instanceof EmailError && error.cause !== undefined ? error.cause : error;
  const { message: errorMessage, code: errorCode } = extractErrorInfo(underlying);

  const payload: EmailRetryPayloadV1 = {
    version: 1,
    kind: "email",
    requestId,
    brokerId: broker.id,
    to: broker.email,
    subject: rendered.subject,
    body: rendered.body,
    templateName,
    identityId,
    createdFrom: "orchestrator",
    originalError: errorCode !== undefined ? { message: errorMessage, code: errorCode } : { message: errorMessage },
  };

  return queue.enqueueIfTransient(broker.id, RETRY_TASK_TYPE.email, payload, underlying);
}
