import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

let dbInstance: BetterSQLite3Database | null = null;
let sqliteInstance: Database.Database | null = null;

export function getDbPath(): string {
  return process.env.SIFT_DB_PATH ?? "data/sift.db";
}

export function getDb(): BetterSQLite3Database {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqliteInstance = sqlite;
  dbInstance = drizzle(sqlite);
  return dbInstance;
}

export function closeDb(): void {
  if (sqliteInstance) {
    sqliteInstance.close();
    sqliteInstance = null;
  }
  dbInstance = null;
}
