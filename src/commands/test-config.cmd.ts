import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import { EmailSender } from "../email/sender.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";
import { resolveImapAuth } from "../inbox/monitor.js";

export async function testConfigCommand(options: {
  config?: string;
}): Promise<void> {
  console.log("\n--- BrokerBane Config Test ---\n");

  // Test config loading
  let config;
  try {
    config = loadConfig(options.config);
    reconfigureLogger({ level: config.logging.level, file: config.logging.file, redactPii: config.logging.redact_pii });
    console.log("✅ Config loaded successfully");
    console.log(`   Profile: ${config.profile.first_name} ${config.profile.last_name}`);
    console.log(`   Template: ${config.options.template}`);
    console.log(`   Regions: ${config.options.regions.join(", ")}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ Config error: ${msg}`);
    return;
  }

  // Test broker database
  try {
    const db = loadBrokerDatabase();
    console.log(`✅ Broker database: ${db.brokers.length} brokers loaded`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ Broker database error: ${msg}`);
  }

  // Test SQLite
  try {
    const db = createDatabase(config.database.path);
    runMigrations(db);
    console.log("✅ SQLite database ready");
    closeDatabase(db);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ SQLite error: ${msg}`);
  }

  // Test SMTP
  try {
    const sender = new EmailSender(config.email);
    await sender.verify();
    console.log(`✅ SMTP connection verified (${config.email.host}:${config.email.port})`);
    await sender.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const msgLower = msg.toLowerCase();
    console.log(`❌ SMTP error: ${msg}`);
    if (msgLower.includes("password") || msgLower.includes("auth") || msgLower.includes("credential") || msgLower.includes("535") || msgLower.includes("login")) {
      console.log("   → Wrong app password. Run 'brokerbane init' and re-enter it.");
      console.log("   → Gmail: myaccount.google.com → Security → 2-Step Verification → App passwords");
      console.log("   → Use the generated 16-character code, NOT your regular Gmail password.");
      console.log("   → Tip: 'brokerbane remove --dry-run' works without a real SMTP connection.");
    } else if (msgLower.includes("econnrefused") || msgLower.includes("etimedout") || msgLower.includes("enotfound")) {
      console.log(`   → Cannot reach ${config.email.host}:${config.email.port}. Check host/port in config.`);
    }
  }

  // Test IMAP (if configured)
  if (config.inbox) {
    try {
      const { ImapFlow } = await import("imapflow");
      const imapAuth = await resolveImapAuth(config.inbox.auth);
      const client = new ImapFlow({
        host: config.inbox.host,
        port: config.inbox.port,
        secure: config.inbox.secure,
        auth: imapAuth,
        logger: false,
      });
      await client.connect();
      await client.logout();
      console.log(`✅ IMAP connection verified (${config.inbox.host}:${config.inbox.port})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const msgLower = msg.toLowerCase();
      console.log(`❌ IMAP error: ${msg}`);
      if (msgLower.includes("auth") || msgLower.includes("password") || msgLower.includes("credential") || msgLower.includes("login") || msgLower.includes("command failed")) {
        console.log("   → Wrong IMAP app password or username. Run 'brokerbane init' to reconfigure.");
        console.log("   → Use the same App Password as SMTP if using the same email account.");
      } else if (msgLower.includes("econnrefused") || msgLower.includes("etimedout") || msgLower.includes("enotfound")) {
        console.log(`   → Cannot reach ${config.inbox.host}:${config.inbox.port}. Check IMAP host/port.`);
      }
    }
  }

  console.log();
}
