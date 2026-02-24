import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseError } from "../util/errors.js";

export function createDatabase(dbPath: string): DatabaseType {
  try {
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);

    // Performance and safety pragmas
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    db.pragma("busy_timeout = 5000");
    db.pragma("synchronous = NORMAL");
    db.pragma("cache_size = -64000"); // 64MB
    db.pragma("temp_store = MEMORY");

    return db;
  } catch (err) {
    throw new DatabaseError(`Failed to open database: ${dbPath}`, err);
  }
}

export function createInMemoryDatabase(): DatabaseType {
  const db = new Database(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function closeDatabase(db: DatabaseType): void {
  try {
    db.close();
  } catch (err) {
    throw new DatabaseError("Failed to close database", err);
  }
}
