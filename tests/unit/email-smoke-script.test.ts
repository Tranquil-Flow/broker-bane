import { describe, expect, it } from "vitest";
import { buildDisposableSmokeConfig, redactSmokeResult } from "../../scripts/email-smoke.js";

describe("disposable email smoke harness helpers", () => {
  const account = {
    user: "test-user@ethereal.email",
    pass: "secret-pass",
    smtp: { host: "smtp.ethereal.email", port: 587, secure: false },
    imap: { host: "imap.ethereal.email", port: 993, secure: true },
    web: "https://ethereal.email",
  };

  it("builds a dedicated-mailbox BrokerBane config that cannot contact real brokers by default", () => {
    const config = buildDisposableSmokeConfig(account, "/tmp/brokerbane-smoke.db");

    expect(config.profile.email).toBe(account.user);
    expect(config.broker_identity?.mode).toBe("dedicated_mailbox");
    expect(config.broker_identity?.email).toBe(account.user);
    expect(config.broker_identity?.smtp.auth).toEqual({ type: "password", user: account.user, pass: account.pass });
    expect(config.broker_identity?.inbox?.auth).toEqual({ type: "password", user: account.user, pass: account.pass });
    expect(config.options.dry_run).toBe(true);
    expect(config.options.daily_limit).toBe(1);
    expect(config.options.delay_min_ms).toBe(10);
    expect(config.database.path).toBe("/tmp/brokerbane-smoke.db");
  });

  it("redacts disposable mailbox secrets while preserving proof handles", () => {
    const redacted = redactSmokeResult({
      account,
      smtpVerified: true,
      imapVerified: true,
      messageId: "<message@example>",
      previewUrl: "https://ethereal.email/message/abc",
    });

    expect(redacted.account.user).toBe(account.user);
    expect(redacted.account.pass).toBe("[redacted]");
    expect(redacted.previewUrl).toBe("https://ethereal.email/message/abc");
    expect(redacted.smtpVerified).toBe(true);
    expect(redacted.imapVerified).toBe(true);
  });
});
