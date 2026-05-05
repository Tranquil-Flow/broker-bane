import type { Broker } from "../types/broker.js";
import type { ImapConfig } from "../types/config.js";
import { REQUEST_STATUS } from "../types/pipeline.js";
import type { BrokerResponseRepo } from "../db/repositories/broker-response.repo.js";
import type { RemovalRequestRepo } from "../db/repositories/removal-request.repo.js";
import { InboxMonitor, type MonitorCallbacks, type MonitorConfig } from "./monitor.js";
import { logger } from "../util/logger.js";

export interface ConfirmationMonitorHandle {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning?(): boolean;
}

export type ConfirmationMonitorFactory = (
  inbox: ImapConfig,
  brokers: readonly Broker[],
  callbacks: MonitorCallbacks,
  monitorConfig?: Partial<MonitorConfig>,
  identityId?: string,
) => ConfirmationMonitorHandle;

export interface ConfirmationWorkerOptions {
  inbox?: ImapConfig;
  identityId: string;
  brokers: readonly Broker[];
  requestRepo: RemovalRequestRepo;
  responseRepo: BrokerResponseRepo;
  monitorFactory?: ConfirmationMonitorFactory;
  monitorConfig?: Partial<MonitorConfig>;
}

export interface ConfirmationWorkerStartResult {
  started: boolean;
  reason?: "missing_inbox" | "no_active_requests" | "already_running";
  activeBrokers: number;
}

export class ConfirmationWorker {
  private monitor: ConfirmationMonitorHandle | null = null;

  constructor(private readonly options: ConfirmationWorkerOptions) {}

  async start(): Promise<ConfirmationWorkerStartResult> {
    if (this.monitor?.isRunning?.()) {
      return { started: false, reason: "already_running", activeBrokers: 0 };
    }

    if (!this.options.inbox) {
      return { started: false, reason: "missing_inbox", activeBrokers: 0 };
    }

    const activeBrokers = this.getActiveConfirmationBrokers();
    if (activeBrokers.length === 0) {
      return { started: false, reason: "no_active_requests", activeBrokers: 0 };
    }

    const factory = this.options.monitorFactory ?? defaultMonitorFactory;
    this.monitor = factory(
      this.options.inbox,
      activeBrokers,
      this.buildCallbacks(),
      this.options.monitorConfig,
      this.options.identityId,
    );
    await this.monitor.start();
    return { started: true, activeBrokers: activeBrokers.length };
  }

  async stop(): Promise<void> {
    await this.monitor?.stop();
    this.monitor = null;
  }

  isRunning(): boolean {
    return this.monitor?.isRunning?.() ?? false;
  }

  private getActiveConfirmationBrokers(): Broker[] {
    const activeIds = new Set(
      [
        ...this.options.requestRepo.getByStatus(REQUEST_STATUS.sent),
        ...this.options.requestRepo.getByStatus(REQUEST_STATUS.awaiting_confirmation),
      ].map((request) => request.broker_id),
    );
    return this.options.brokers.filter((broker) => activeIds.has(broker.id));
  }

  private buildCallbacks(): MonitorCallbacks {
    return {
      onConfirmation: (brokerId, url, success) => {
        if (!success) return;
        const request = this.options.requestRepo.getLatestForBroker(brokerId);
        if (!request) {
          logger.warn({ brokerId }, "Confirmation received but no removal request exists");
          return;
        }
        this.options.requestRepo.updateStatus(request.id, REQUEST_STATUS.confirmed);
        this.options.responseRepo.create({
          requestId: request.id,
          responseType: "confirmation",
          rawBodyHash: simpleHash(url),
          confirmationUrl: url,
          urlDomain: extractDomain(url),
        });
        logger.info({ brokerId }, "Confirmation auto-processed from persistent inbox worker");
      },
      onConnectionLost: () => {
        logger.warn("Persistent confirmation monitor connection lost");
      },
      onReconnected: (attempt) => {
        logger.info({ attempt }, "Persistent confirmation monitor reconnected");
      },
      onReconnectFailed: (attempt, error) => {
        logger.warn({ attempt, err: error }, "Persistent confirmation monitor reconnect failed");
      },
    };
  }
}

function defaultMonitorFactory(
  inbox: ImapConfig,
  brokers: readonly Broker[],
  callbacks: MonitorCallbacks,
  monitorConfig?: Partial<MonitorConfig>,
  identityId?: string,
): ConfirmationMonitorHandle {
  return new InboxMonitor(inbox, brokers, callbacks, monitorConfig, identityId);
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return (h >>> 0).toString(16);
}

function extractDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}
