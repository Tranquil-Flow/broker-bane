import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import type { SmtpConfig } from "../types/config.js";
import { EmailError } from "../util/errors.js";
import { logger } from "../util/logger.js";

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

  constructor(config: SmtpConfig, dryRun = false) {
    this.config = config;
    this.dryRun = dryRun;
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure,
        auth: {
          user: this.config.auth.user,
          pass: this.config.auth.pass,
        },
        pool: this.config.pool,
        maxConnections: 1,
        rateDelta: this.config.rate_delta_ms,
        rateLimit: this.config.rate_limit,
      } as SMTPTransport.Options);
    }
    return this.transporter;
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
      const info = await this.getTransporter().sendMail({
        from: params.from,
        to: params.to,
        subject: params.subject,
        text: params.text,
      });

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
    await this.getTransporter().verify();
    return true;
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}
