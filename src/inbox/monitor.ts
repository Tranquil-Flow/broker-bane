import type { ImapConfig, EmailAuth } from "../types/config.js";
import type { Broker } from "../types/broker.js";
import { simpleParser } from "mailparser";
import { parseConfirmationEmail } from "./parser.js";
import { clickConfirmationLink } from "./confirmer.js";
import { logger } from "../util/logger.js";
import { loadTokens, isExpired } from "../auth/token-store.js";
import { refreshGoogleToken } from "../auth/google-oauth.js";
import { refreshMicrosoftToken } from "../auth/microsoft-oauth.js";
import { exponentialBackoff, sleep } from "../util/delay.js";

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
  onConnectionLost?: () => void;
  onReconnected?: (attempt: number) => void;
  onReconnectFailed?: (attempt: number, error: Error) => void;
}

export interface MonitorConfig {
  /** Maximum number of reconnect attempts before giving up (0 = infinite) */
  maxReconnectAttempts: number;
  /** Initial delay between reconnect attempts in ms */
  initialReconnectDelayMs: number;
  /** Backoff multiplier for reconnect delays */
  backoffMultiplier: number;
  /** Jitter fraction for reconnect delays (0-1) */
  jitter: number;
  /** Maximum delay between reconnect attempts in ms */
  maxReconnectDelayMs: number;
}

const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  maxReconnectAttempts: 0, // Infinite by default
  initialReconnectDelayMs: 5000, // 5 seconds
  backoffMultiplier: 2,
  jitter: 0.25,
  maxReconnectDelayMs: 300000, // 5 minutes max
};

/** Error patterns that indicate connection was lost and should trigger reconnect */
const RECONNECTABLE_ERRORS = [
  "connection lost",
  "connection reset",
  "socket closed",
  "socket hang up",
  "econnreset",
  "etimedout",
  "epipe",
  "connection timed out",
  "unexpected end of input",
  "server unavailable",
  "bye",
];

function isReconnectableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const message = (err as Error).message?.toLowerCase() ?? "";
  const code = ((err as { code?: string }).code ?? "").toLowerCase();
  
  return RECONNECTABLE_ERRORS.some(
    (pattern) => message.includes(pattern) || code.includes(pattern)
  );
}

export class InboxMonitor {
  private client: unknown = null;
  private running = false;
  private reconnecting = false;
  private reconnectAttempt = 0;
  private readonly imapConfig: ImapConfig;
  private readonly monitorConfig: MonitorConfig;
  private readonly brokers: readonly Broker[];
  private readonly callbacks: MonitorCallbacks;

  constructor(
    imapConfig: ImapConfig,
    brokers: readonly Broker[],
    callbacks: MonitorCallbacks = {},
    monitorConfig: Partial<MonitorConfig> = {}
  ) {
    this.imapConfig = imapConfig;
    this.brokers = brokers;
    this.callbacks = callbacks;
    this.monitorConfig = { ...DEFAULT_MONITOR_CONFIG, ...monitorConfig };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      const { ImapFlow } = await import("imapflow");

      const imapAuth = await resolveImapAuth(this.imapConfig.auth);

      this.client = new ImapFlow({
        host: this.imapConfig.host,
        port: this.imapConfig.port,
        secure: this.imapConfig.secure,
        auth: imapAuth as { user: string; pass: string },
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
      const lock = await imapClient.getMailboxLock(this.imapConfig.mailbox);

      // Reset reconnect counter on successful connection
      if (this.reconnectAttempt > 0) {
        this.callbacks.onReconnected?.(this.reconnectAttempt);
        logger.info(
          { attempt: this.reconnectAttempt },
          "IMAP reconnection successful"
        );
      }
      this.reconnectAttempt = 0;
      this.reconnecting = false;

      logger.info({ mailbox: this.imapConfig.mailbox }, "IMAP monitor started");

      // Register error handler for connection issues
      imapClient.on("error", (err: unknown) => {
        logger.error({ err }, "IMAP connection error");
        if (this.running && isReconnectableError(err)) {
          this.handleConnectionLost();
        }
      });

      // Register close handler
      imapClient.on("close", () => {
        logger.warn("IMAP connection closed");
        if (this.running) {
          this.handleConnectionLost();
        }
      });

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
        while (this.running && !this.reconnecting) {
          await imapClient.idle();
        }
      } finally {
        lock.release();
      }
    } catch (err) {
      logger.error({ err }, "IMAP monitor error");
      
      if (this.running && isReconnectableError(err)) {
        await this.handleConnectionLost();
      } else {
        this.running = false;
        throw err;
      }
    }
  }

  private async handleConnectionLost(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;

    // Clean up old client
    await this.closeClient();
    
    this.callbacks.onConnectionLost?.();
    logger.warn("IMAP connection lost, attempting to reconnect...");

    while (this.running) {
      this.reconnectAttempt++;

      // Check max attempts
      if (
        this.monitorConfig.maxReconnectAttempts > 0 &&
        this.reconnectAttempt > this.monitorConfig.maxReconnectAttempts
      ) {
        const error = new Error(
          `Max reconnect attempts (${this.monitorConfig.maxReconnectAttempts}) exceeded`
        );
        this.callbacks.onReconnectFailed?.(this.reconnectAttempt - 1, error);
        logger.error({ attempts: this.reconnectAttempt - 1 }, "Max reconnect attempts exceeded");
        this.running = false;
        throw error;
      }

      // Calculate delay with exponential backoff
      let delayMs = exponentialBackoff(
        this.reconnectAttempt - 1,
        this.monitorConfig.initialReconnectDelayMs,
        this.monitorConfig.backoffMultiplier,
        this.monitorConfig.jitter
      );
      delayMs = Math.min(delayMs, this.monitorConfig.maxReconnectDelayMs);

      logger.info(
        { attempt: this.reconnectAttempt, delayMs },
        "Waiting before reconnect attempt"
      );

      await sleep(delayMs);

      if (!this.running) break;

      try {
        await this.connect();
        return; // Successfully reconnected
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.callbacks.onReconnectFailed?.(this.reconnectAttempt, error);
        logger.warn(
          { attempt: this.reconnectAttempt, err },
          "Reconnect attempt failed"
        );
        // Continue loop for next attempt
      }
    }
  }

  private async closeClient(): Promise<void> {
    if (this.client) {
      try {
        const imapClient = this.client as {
          logout(): Promise<void>;
          close(): Promise<void>;
        };
        await imapClient.logout();
        await imapClient.close();
      } catch (err) {
        // Ignore close errors during reconnection
        logger.debug({ err }, "Error closing IMAP client during reconnect");
      }
      this.client = null;
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.closeClient();
    logger.info("IMAP monitor stopped");
  }

  isRunning(): boolean {
    return this.running;
  }

  isReconnecting(): boolean {
    return this.reconnecting;
  }

  getReconnectAttempt(): number {
    return this.reconnectAttempt;
  }
}
