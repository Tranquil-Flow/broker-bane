/**
 * Live SMTP integration tests using Ethereal (https://ethereal.email).
 * Ethereal provides disposable test accounts — emails are accepted and
 * viewable in their web UI but never delivered to real inboxes.
 *
 * These tests make real network connections. They run in CI if
 * ETHEREAL_USER / ETHEREAL_PASS env vars are set, otherwise they create
 * a fresh Ethereal account on the fly (requires internet access).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("keytar", () => ({
  default: {
    setPassword: vi.fn(async () => undefined),
    getPassword: vi.fn(async () => null),
    deletePassword: vi.fn(async () => true),
  },
}));
import nodemailer from "nodemailer";
import { EmailSender } from "../../src/email/sender.js";
import type { SmtpConfig } from "../../src/types/config.js";

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

async function getEtherealAccount(): Promise<EtherealAccount> {
  // Re-use existing credentials from env if available (useful for CI caching)
  if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
    return {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS,
      smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
    };
  }

  // Create a fresh ephemeral account
  const account = await nodemailer.createTestAccount();
  return {
    user: account.user,
    pass: account.pass,
    smtp: { host: account.smtp.host, port: account.smtp.port, secure: account.smtp.secure },
  };
}

describe("SMTP live integration (Ethereal)", { timeout: 30_000 }, () => {
  let account: EtherealAccount;
  let smtpConfig: SmtpConfig;

  beforeAll(async () => {
    account = await getEtherealAccount();
    smtpConfig = {
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
      pool: false,
      rate_limit: 10,
      rate_delta_ms: 1000,
    };
  });

  it("verifies SMTP connection successfully", async () => {
    const sender = new EmailSender(smtpConfig, false);
    const ok = await sender.verify();
    expect(ok).toBe(true);
    await sender.close();
  });

  it("sends an email and returns a messageId", async () => {
    const sender = new EmailSender(smtpConfig, false);
    const result = await sender.send({
      from: account.user,
      to: account.user,
      subject: "BrokerBane GDPR Removal Request — Test",
      text: "This is a test opt-out email from the BrokerBane integration test suite.",
    });

    expect(result.messageId).toBeTruthy();
    expect(result.accepted).toContain(account.user);
    expect(result.rejected).toHaveLength(0);

    // Log the Ethereal preview URL so developers can inspect the sent email
    const previewUrl = nodemailer.getTestMessageUrl({ messageId: result.messageId } as any);
    if (previewUrl) {
      console.info(`\n  Ethereal preview: ${previewUrl}`);
    }

    await sender.close();
  });

  it("sends multiple emails with rate limiting without error", async () => {
    const sender = new EmailSender(smtpConfig, false);

    const sends = [
      sender.send({ from: account.user, to: account.user, subject: "Test 1", text: "Body 1" }),
      sender.send({ from: account.user, to: account.user, subject: "Test 2", text: "Body 2" }),
      sender.send({ from: account.user, to: account.user, subject: "Test 3", text: "Body 3" }),
    ];

    const results = await Promise.all(sends);
    for (const result of results) {
      expect(result.messageId).toBeTruthy();
      expect(result.rejected).toHaveLength(0);
    }

    await sender.close();
  });
});
