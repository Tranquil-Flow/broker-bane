import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { SmtpConfig } from "../types/config.js";
import { EmailError } from "../util/errors.js";
import { logger } from "../util/logger.js";
import { loadTokens, isExpired } from "../auth/token-store.js";
import { refreshGoogleToken } from "../auth/google-oauth.js";
import { refreshMicrosoftToken } from "../auth/microsoft-oauth.js";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  from: string;
}

export interface SendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

export class EmailSender {
  private transporter: Transporter | null = null;
  private readonly config: SmtpConfig;
  private readonly dryRun: boolean;
  private readonly identityId: string;

  constructor(config: SmtpConfig, dryRun = false, identityId = "default") {
    this.config = config;
    this.dryRun = dryRun;
    this.identityId = identityId;
  }

  private async resolveAuth(): Promise<object> {
    if (this.config.auth.type === "oauth2") {
      let tokens = await loadTokens(this.config.auth.provider, this.identityId);
      if (!tokens) {
        throw new Error("No OAuth tokens found. Run 'brokerbane init' to reconnect your email account.");
      }
      if (isExpired(tokens)) {
        tokens = this.config.auth.provider === "google"
          ? await refreshGoogleToken(tokens.refreshToken, this.identityId)
          : await refreshMicrosoftToken(this.config.auth.user, this.identityId);
      }
      return {
        type: "OAuth2",
        user: this.config.auth.user,
        accessToken: tokens.accessToken,
      };
    }
    // password auth
    return {
      user: this.config.auth.user,
      pass: (this.config.auth as { type: "password"; user: string; pass: string }).pass,
    };
  }

  private async createTransport(): Promise<Transporter> {
    const auth = await this.resolveAuth();
    this.transporter = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      secure: this.config.secure,
      auth,
      pool: this.config.pool,
      maxConnections: 1,
      rateDelta: this.config.rate_delta_ms,
      rateLimit: this.config.rate_limit,
    } as SMTPTransport.Options);
    return this.transporter;
  }

  private async getTransport(): Promise<Transporter> {
    // For OAuth2, check if token expired and invalidate cached transport
    if (this.transporter && this.config.auth.type === "oauth2") {
      const tokens = await loadTokens(this.config.auth.provider, this.identityId);
      if (tokens && isExpired(tokens)) {
        this.transporter = null; // force recreation with fresh token
      }
    }
    if (!this.transporter) {
      await this.createTransport();
    }
    return this.transporter!;
  }

  async send(params: SendEmailParams): Promise<SendResult> {
    if (this.dryRun) {
      logger.info({ to: params.to, subject: params.subject }, "DRY RUN: Would send email");
      return {
        messageId: `dry-run-${Date.now()}@brokerbane`,
        accepted: [params.to],
        rejected: [],
      };
    }

    try {
      const transport = await this.getTransport();
      const mailOptions = {
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        xMailer: false as false | string,
        headers: {
          "Reply-To": params.from,
        },
      };
      const info = await transport.sendMail(
        mailOptions as Parameters<typeof transport.sendMail>[0]
      ) as SMTPTransport.SentMessageInfo;

      logger.info(
        { messageId: info.messageId, to: params.to },
        "Email sent successfully"
      );

      return {
        messageId: info.messageId,
        accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
        rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
      };
    } catch (err) {
      throw new EmailError(`Failed to send email to ${params.to}`, err);
    }
  }

  async verify(): Promise<boolean> {
    if (this.dryRun) return true;
    const transport = await this.getTransport();
    await transport.verify();
    return true;
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}
