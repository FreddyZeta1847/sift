import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getDbPath, getDb, closeDb } from "./client";

describe("getDbPath", () => {
  const originalEnv = process.env.SIFT_DB_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SIFT_DB_PATH;
    } else {
      process.env.SIFT_DB_PATH = originalEnv;
    }
  });

  it("defaults to data/sift.db when SIFT_DB_PATH is unset", () => {
    delete process.env.SIFT_DB_PATH;
    expect(getDbPath()).toBe("data/sift.db");
  });

  it("uses SIFT_DB_PATH when set", () => {
    process.env.SIFT_DB_PATH = "custom/path.db";
    expect(getDbPath()).toBe("custom/path.db");
  });
});

describe("getDb", () => {
  const testDbPath = "data/test-client.db";

  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    if (existsSync(testDbPath)) rmSync(testDbPath);
  });

  it("creates the data/ directory and a .db file if missing", () => {
    getDb();
    expect(existsSync(testDbPath)).toBe(true);
  });
});
