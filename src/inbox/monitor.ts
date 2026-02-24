import type { ImapConfig } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { parseConfirmationEmail } from "./parser.js";
import { clickConfirmationLink } from "./confirmer.js";
import { logger } from "../util/logger.js";

export interface MonitorCallbacks {
  onConfirmation?: (brokerId: string, url: string, success: boolean) => void;
  onNewEmail?: (from: string, subject: string) => void;
}

export class InboxMonitor {
  private client: unknown = null;
  private running = false;
  private readonly config: ImapConfig;
  private readonly brokers: readonly Broker[];
  private readonly callbacks: MonitorCallbacks;

  constructor(
    config: ImapConfig,
    brokers: readonly Broker[],
    callbacks: MonitorCallbacks = {}
  ) {
    this.config = config;
    this.brokers = brokers;
    this.callbacks = callbacks;
  }

  async start(): Promise<void> {
    if (this.running) return;

    try {
      const { ImapFlow } = await import("imapflow");

      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
        logger: false,
      });

      const imapClient = this.client as {
        connect(): Promise<void>;
        getMailboxLock(mailbox: string): Promise<{ release(): void }>;
        fetchOne(seq: string, query: object): Promise<{
          envelope: { from: Array<{ address: string }>; subject: string };
          source: Buffer;
        }>;
        idle(): Promise<void>;
        on(event: string, handler: (...args: unknown[]) => void): void;
        logout(): Promise<void>;
        close(): Promise<void>;
      };

      await imapClient.connect();
      const lock = await imapClient.getMailboxLock(this.config.mailbox);
      this.running = true;

      logger.info({ mailbox: this.config.mailbox }, "IMAP monitor started");

      imapClient.on("exists", async () => {
        try {
          const message = await imapClient.fetchOne("*", {
            envelope: true,
            source: true,
          });

          const from = message.envelope.from[0]?.address ?? "";
          const subject = message.envelope.subject ?? "";
          const body = message.source.toString("utf-8");

          this.callbacks.onNewEmail?.(from, subject);

          const parsed = parseConfirmationEmail(from, subject, body, this.brokers);

          if (parsed.brokerMatch && parsed.confirmationUrls.length > 0) {
            for (const url of parsed.confirmationUrls) {
              const result = await clickConfirmationLink(url, parsed.brokerMatch);
              this.callbacks.onConfirmation?.(
                parsed.brokerMatch.id,
                url,
                result.success
              );
              if (result.success) break;
            }
          }
        } catch (err) {
          logger.error({ err }, "Error processing new email");
        }
      });

      // Start IDLE - this keeps the connection alive and listens for new messages
      try {
        while (this.running) {
          await imapClient.idle();
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      logger.error({ err }, "IMAP monitor error");
      this.running = false;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.client) {
      try {
        const imapClient = this.client as {
          logout(): Promise<void>;
          close(): Promise<void>;
        };
        await imapClient.logout();
        await imapClient.close();
      } catch (err) {
        logger.warn({ err }, "Error stopping IMAP monitor");
      }
      this.client = null;
    }
    logger.info("IMAP monitor stopped");
  }

  isRunning(): boolean {
    return this.running;
  }
}
