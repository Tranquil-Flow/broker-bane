import type { EmailSender } from "../email/sender.js";
import type { AppConfig, SmtpConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import type { EmailLogRepo } from "../db/repositories/email-log.repo.js";
import type { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
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

export function createRetryHandlers(_init: RetryHandlerFactoryInit): RetryWorkerHandlers {
  return {
    email: async () => {
      throw new Error("email retry handler not implemented");
    },
  };
}
