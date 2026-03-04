import type { ImapConfig, EmailAuth } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { simpleParser } from "mailparser";
import { parseConfirmationEmail } from "./parser.js";
import { clickConfirmationLink } from "./confirmer.js";
import { logger } from "../util/logger.js";
import { loadTokens, isExpired } from "../auth/token-store.js";
import { refreshGoogleToken } from "../auth/google-oauth.js";
import { refreshMicrosoftToken } from "../auth/microsoft-oauth.js";

export async function resolveImapAuth(
  auth: EmailAuth,
): Promise<{ user: string; pass: string } | { user: string; accessToken: string }> {
  if (auth.type === "password") {
    return { user: auth.user, pass: auth.pass };
  }

  // OAuth2
  let tokens = await loadTokens(auth.provider);
  if (!tokens) {
    throw new Error(`No OAuth tokens found for ${auth.provider}. Run 'brokerbane init' to set up.`);
  }

  if (isExpired(tokens)) {
    tokens =
      auth.provider === "google"
        ? await refreshGoogleToken(tokens.refreshToken)
        : await refreshMicrosoftToken(auth.user);
  }

  return { user: auth.user, accessToken: tokens.accessToken };
}

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

      const imapAuth = await resolveImapAuth(this.config.auth);

      this.client = new ImapFlow({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: imapAuth,
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

          // Use mailparser to properly decode MIME (quoted-printable,
          // base64, charset conversion) before extracting URLs
          const mail = await simpleParser(message.source);
          const from = mail.from?.value[0]?.address ?? message.envelope.from[0]?.address ?? "";
          const subject = mail.subject ?? message.envelope.subject ?? "";
          const body = mail.html || mail.textAsHtml || mail.text || "";

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
