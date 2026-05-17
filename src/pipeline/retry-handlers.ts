import { EmailSender } from "../email/sender.js";
import { buildTemplateVariables, renderTemplate } from "../email/template-engine.js";
import type { AppConfig, SmtpConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import type { EmailLogRepo } from "../db/repositories/email-log.repo.js";
import type { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { getBrokerFacingEmail, getBrokerIdentityId, getEffectiveBrokerIdentity } from "../types/identity.js";
import { EMAIL_DIRECTION, EMAIL_LOG_STATUS, REQUEST_STATUS } from "../types/pipeline.js";
import { isEmailRetryPayloadV1 } from "./retry-payloads.js";
import type { RetryWorkerHandlers } from "./retry-worker.js";

export type RetrySenderFactory = (
  smtp: SmtpConfig,
  dryRun: boolean,
  identityId: string,
) => Pick<EmailSender, "send" | "close">;

export interface RetryHandlerFactoryInit {
  config: AppConfig;
  brokers: readonly Broker[];
  requestRepo: RemovalRequestRepo;
  emailLogRepo: EmailLogRepo;
  senderFactory?: RetrySenderFactory;
  dryRun?: boolean;
}

export interface RetryHandlerBundle {
  handlers: RetryWorkerHandlers;
  close(): Promise<void>;
}

// Statuses where a retry would be a no-op: the request already reached a
// positive terminal or in-flight-elsewhere state. Keep in sync with REQUEST_STATUS
// — adding a new terminal-positive value there should also be added here.
const TERMINAL_OR_DONE_STATUSES: ReadonlySet<string> = new Set([
  REQUEST_STATUS.sent,
  REQUEST_STATUS.awaiting_confirmation,
  REQUEST_STATUS.confirmed,
  REQUEST_STATUS.completed,
  REQUEST_STATUS.skipped,
  REQUEST_STATUS.manual_required,
]);

function defaultSenderFactory(smtp: SmtpConfig, dryRun: boolean, identityId: string): EmailSender {
  return new EmailSender(smtp, dryRun, identityId);
}

export function createRetryHandlers(init: RetryHandlerFactoryInit): RetryHandlerBundle {
  const { config, brokers, requestRepo, emailLogRepo } = init;
  const senderFactory = init.senderFactory ?? defaultSenderFactory;
  const dryRun = init.dryRun ?? config.options.dry_run;

  const brokerById = new Map<string, Broker>();
  for (const broker of brokers) brokerById.set(broker.id, broker);

  // One sender is shared across every retry task processed by this bundle —
  // RetryWorker drains tasks sequentially, so a pooled transport amortises the
  // SMTP connect/auth round trip across the whole cycle. close() tears it down.
  let cachedSender: Pick<EmailSender, "send" | "close"> | null = null;

  const handlers: RetryWorkerHandlers = {
    email: async ({ payload }) => {
      if (!isEmailRetryPayloadV1(payload)) {
        throw new Error("retry-handlers/email: malformed payload (not EmailRetryPayloadV1)");
      }

      const request = requestRepo.getById(payload.requestId);
      if (!request) {
        throw new Error(`retry-handlers/email: request ${payload.requestId} not found`);
      }

      if (TERMINAL_OR_DONE_STATUSES.has(request.status)) {
        return;
      }

      const broker = brokerById.get(payload.brokerId);
      if (!broker) {
        throw new Error(`retry-handlers/email: broker ${payload.brokerId} not found`);
      }
      if (!broker.email) {
        throw new Error(`retry-handlers/email: broker ${broker.id} no longer has an email address`);
      }

      let subject = payload.subject;
      let body = payload.body;
      if (!subject || !body) {
        const brokerFacingEmail = getBrokerFacingEmail(config);
        const variables = buildTemplateVariables(config.profile, broker.name, brokerFacingEmail);
        const templateName = payload.templateName ?? config.options.template;
        const rendered = renderTemplate(templateName, variables, broker.id);
        subject = subject ?? rendered.subject;
        body = body ?? rendered.body;
      }

      const identity = getEffectiveBrokerIdentity(config);
      const brokerFacingEmail = identity.email;
      const identityId = getBrokerIdentityId(config);
      if (!cachedSender) {
        cachedSender = senderFactory(identity.smtp, dryRun, identityId);
      }
      const sender = cachedSender;

      const result = await sender.send({
        from: brokerFacingEmail,
        to: payload.to,
        subject,
        text: body,
      });

      const allRejected = result.rejected.length > 0 && result.accepted.length === 0;

      emailLogRepo.create({
        requestId: payload.requestId,
        direction: EMAIL_DIRECTION.outbound,
        messageId: result.messageId,
        fromAddr: brokerFacingEmail,
        toAddr: payload.to,
        subject,
        status: allRejected ? EMAIL_LOG_STATUS.rejected : EMAIL_LOG_STATUS.sent,
        identityId,
      });

      if (allRejected) {
        throw new Error(`retry-handlers/email: all recipients rejected for ${payload.to}`);
      }

      requestRepo.updateStatus(payload.requestId, REQUEST_STATUS.sent);
    },
  };

  return {
    handlers,
    async close(): Promise<void> {
      if (cachedSender) {
        const sender = cachedSender;
        cachedSender = null;
        await sender.close();
      }
    },
  };
}
