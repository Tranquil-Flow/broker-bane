/**
 * Live inbox monitor integration test using Ethereal (https://ethereal.email).
 * Ethereal provides disposable SMTP + IMAP accounts — emails are accepted and
 * readable via IMAP but never delivered to real inboxes.
 *
 * Tests the full flow:
 *   1. Connect InboxMonitor to Ethereal IMAP
 *   2. Send a fake broker confirmation email via SMTP
 *   3. Verify the monitor detects the email
 *   4. Verify broker matching and URL extraction
 *
 * These tests make real network connections. They run if
 * ETHEREAL_USER / ETHEREAL_PASS env vars are set, otherwise they create
 * a fresh Ethereal account on the fly.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import nodemailer from "nodemailer";
import { InboxMonitor } from "../../src/inbox/monitor.js";
import { parseConfirmationEmail } from "../../src/inbox/parser.js";
import { loadBrokerDatabase } from "../../src/data/broker-loader.js";
import type { ImapConfig } from "../../src/types/config.js";
import type { Broker } from "../../src/types/broker.js";

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
  imap: { host: string; port: number; secure: boolean };
}

async function getEtherealAccount(): Promise<EtherealAccount> {
  if (process.env.ETHEREAL_USER && process.env.ETHEREAL_PASS) {
    return {
      user: process.env.ETHEREAL_USER,
      pass: process.env.ETHEREAL_PASS,
      smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
      imap: { host: "imap.ethereal.email", port: 993, secure: true },
    };
  }

  const account = await nodemailer.createTestAccount();
  return {
    user: account.user,
    pass: account.pass,
    smtp: { host: account.smtp.host, port: account.smtp.port, secure: account.smtp.secure },
    imap: { host: account.imap.host, port: account.imap.port, secure: account.imap.secure },
  };
}

describe("Inbox monitor integration (Ethereal)", { timeout: 60_000 }, () => {
  let account: EtherealAccount;
  let transporter: nodemailer.Transporter;
  let brokers: readonly Broker[];

  beforeAll(async () => {
    account = await getEtherealAccount();
    transporter = nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.user, pass: account.pass },
    });

    const db = loadBrokerDatabase();
    brokers = db.brokers;
  });

  afterAll(async () => {
    transporter?.close();
  });

  it("parseConfirmationEmail matches a broker by sender domain", () => {
    const parsed = parseConfirmationEmail(
      "noreply@spokeo.com",
      "Please confirm your opt-out request",
      `<html><body>
        <p>Click here to confirm your removal:</p>
        <a href="https://www.spokeo.com/optout/confirm?token=abc123">Confirm</a>
      </body></html>`,
      brokers
    );

    expect(parsed.brokerMatch).toBeDefined();
    expect(parsed.brokerMatch!.id).toBe("spokeo");
    expect(parsed.confirmationUrls.length).toBeGreaterThan(0);
    expect(parsed.confirmationUrls.some((u) => u.includes("spokeo.com"))).toBe(true);
  });

  it("parseConfirmationEmail returns no match for unknown sender", () => {
    const parsed = parseConfirmationEmail(
      "noreply@unknownbroker999.com",
      "Confirm your request",
      `<html><body><a href="https://unknownbroker999.com/confirm">Confirm</a></body></html>`,
      brokers
    );

    expect(parsed.brokerMatch).toBeUndefined();
  });

  it("extracts multiple URLs and filters non-confirmation ones", () => {
    const parsed = parseConfirmationEmail(
      "privacy@beenverified.com",
      "Opt-out confirmation",
      `<html><body>
        <a href="https://www.beenverified.com/optout/confirm?id=xyz">Confirm removal</a>
        <a href="https://www.beenverified.com/unsubscribe">Unsubscribe</a>
        <a href="https://www.beenverified.com/privacy-policy">Privacy</a>
        <img src="https://www.beenverified.com/logo.png" />
      </body></html>`,
      brokers
    );

    // unsubscribe, privacy-policy, and .png should be filtered out
    expect(parsed.confirmationUrls).toContain(
      "https://www.beenverified.com/optout/confirm?id=xyz"
    );
    expect(parsed.confirmationUrls.every((u) => !u.includes("unsubscribe"))).toBe(true);
    expect(parsed.confirmationUrls.every((u) => !u.includes("privacy-policy"))).toBe(true);
    expect(parsed.confirmationUrls.every((u) => !u.endsWith(".png"))).toBe(true);
  });

  it("InboxMonitor connects to Ethereal IMAP and detects a new email", async () => {
    const imapConfig: ImapConfig = {
      host: account.imap.host,
      port: account.imap.port,
      secure: account.imap.secure,
      auth: { user: account.user, pass: account.pass },
      mailbox: "INBOX",
    };

    const received: Array<{ from: string; subject: string }> = [];
    const confirmations: Array<{ brokerId: string; url: string; success: boolean }> = [];

    const monitor = new InboxMonitor(imapConfig, brokers, {
      onNewEmail: (from, subject) => {
        received.push({ from, subject });
      },
      onConfirmation: (brokerId, url, success) => {
        confirmations.push({ brokerId, url, success });
      },
    });

    // Start monitor in background (it enters IDLE mode)
    let startError: Error | null = null;
    const monitorPromise = monitor.start().catch((err) => {
      startError = err;
    });

    // Give the monitor time to connect and enter IDLE
    // Ethereal IMAP can be slow
    const connectDeadline = Date.now() + 10_000;
    while (!monitor.isRunning() && !startError && Date.now() < connectDeadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    if (startError) {
      console.info(`  IMAP connection failed: ${startError.message}`);
      console.info("  Skipping live IMAP test (Ethereal may be down or blocked)");
      return;
    }

    expect(monitor.isRunning()).toBe(true);

    // Send a fake confirmation email "from" a broker
    await transporter.sendMail({
      from: `"Spokeo Privacy" <noreply@spokeo.com>`,
      to: account.user,
      subject: "Please confirm your opt-out request",
      html: `<html><body>
        <p>We received your opt-out request. Please click below to confirm:</p>
        <a href="https://www.spokeo.com/optout/confirm?token=test123">Confirm Removal</a>
        <p>If you did not request this, please ignore this email.</p>
      </body></html>`,
    });

    // Wait for the monitor to process the new email
    // IMAP IDLE has some latency — give it up to 15 seconds
    const deadline = Date.now() + 15_000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Stop the monitor
    await monitor.stop();

    // Verify the email was detected
    expect(received.length).toBeGreaterThanOrEqual(1);
    const email = received.find((e) => e.subject.includes("opt-out"));
    expect(email).toBeDefined();
    console.info(`  Monitor detected email from: ${email!.from}, subject: "${email!.subject}"`);

    // The confirmation callback may or may not fire depending on whether the
    // click attempt to spokeo.com succeeds/fails. Either way, if it fires,
    // it should have the right broker ID.
    if (confirmations.length > 0) {
      expect(confirmations[0].brokerId).toBe("spokeo");
      console.info(`  Confirmation callback: broker=${confirmations[0].brokerId}, success=${confirmations[0].success}`);
    } else {
      console.info("  Confirmation link click was not attempted or failed silently (expected for test)");
    }
  });
});
