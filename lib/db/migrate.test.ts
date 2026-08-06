/**
 * Tests for lib/db/migrate.ts's runMigrations — confirms a fresh
 * database ends up with every table the schema currently defines, and
 * that re-running migrations against an already-migrated database is a
 * no-op rather than an error.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate";
import { closeDb } from "./client";

describe("runMigrations", () => {
  const testDbPath = "data/test-migrate.db";

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.resetModules();
    if (existsSync(testDbPath)) rmSync(testDbPath);
    if (existsSync(`${testDbPath}-wal`)) rmSync(`${testDbPath}-wal`);
    if (existsSync(`${testDbPath}-shm`)) rmSync(`${testDbPath}-shm`);
  });

  it("creates all 6 tables against a fresh database", () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();

    const sqlite = new Database(testDbPath);
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toEqual([
      "__drizzle_migrations",
      "candidates",
      "llm_calls",
      "pipeline_runs",
      "post_translations",
      "posts",
      "sources",
      "sqlite_sequence",
    ]);
    sqlite.close();
  });

  it("is idempotent — running twice does not throw", () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    expect(() => runMigrations()).not.toThrow();
  });
});
