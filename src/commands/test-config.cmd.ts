import { loadConfig } from "../config/loader.js";
import { reconfigureLogger } from "../util/logger.js";
import { loadBrokerDatabase } from "../data/broker-loader.js";
import { EmailSender } from "../email/sender.js";
import { createDatabase, closeDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrations.js";

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
    const ok = await sender.verify();
    if (ok) {
      console.log("✅ SMTP connection verified");
    } else {
      console.log("❌ SMTP connection failed");
    }
    await sender.close();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ SMTP error: ${msg}`);
  }

  console.log();
}
