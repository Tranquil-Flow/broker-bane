import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrations.js";
import { EmailLogRepo } from "../../src/db/repositories/email-log.repo.js";
import { OptionsConfigSchema } from "../../src/types/config.js";

describe("OptionsConfigSchema daily_limit", () => {
  it("accepts daily_limit", () => {
    const result = OptionsConfigSchema.safeParse({ daily_limit: 40 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.daily_limit).toBe(40);
  });

  it("daily_limit is optional (undefined by default)", () => {
    const result = OptionsConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.daily_limit).toBeUndefined();
  });
});

describe("EmailLogRepo.countSentToday", () => {
  let db: InstanceType<typeof Database>;
  let repo: EmailLogRepo;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
    repo = new EmailLogRepo(db);
    // Insert parent removal_requests rows to satisfy FK constraints
    db.prepare(`
      INSERT INTO removal_requests (id, broker_id, method) VALUES (1, 'broker-a', 'email')
    `).run();
    db.prepare(`
      INSERT INTO removal_requests (id, broker_id, method) VALUES (2, 'broker-b', 'email')
    `).run();
    db.prepare(`
      INSERT INTO removal_requests (id, broker_id, method) VALUES (3, 'broker-c', 'email')
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it("returns 0 when no emails sent today", () => {
    expect(repo.countSentToday()).toBe(0);
  });

  it("counts only outbound sent emails", () => {
    db.prepare(`
      INSERT INTO email_log (request_id, direction, message_id, from_addr, to_addr, subject, status, created_at)
      VALUES (1, 'outbound', 'msg1', 'me@test.com', 'them@test.com', 'test', 'sent', datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO email_log (request_id, direction, message_id, from_addr, to_addr, subject, status, created_at)
      VALUES (2, 'outbound', 'msg2', 'me@test.com', 'other@test.com', 'test', 'rejected', datetime('now'))
    `).run();
    db.prepare(`
      INSERT INTO email_log (request_id, direction, message_id, from_addr, to_addr, subject, status, created_at)
      VALUES (3, 'inbound', 'msg3', 'them@test.com', 'me@test.com', 'reply', 'received', datetime('now'))
    `).run();
    expect(repo.countSentToday()).toBe(1);
  });

  it("does not count emails from previous days", () => {
    db.prepare(`
      INSERT INTO email_log (request_id, direction, message_id, from_addr, to_addr, subject, status, created_at)
      VALUES (1, 'outbound', 'msg1', 'me@test.com', 'them@test.com', 'test', 'sent', datetime('now', '-1 day'))
    `).run();
    expect(repo.countSentToday()).toBe(0);
  });
});
