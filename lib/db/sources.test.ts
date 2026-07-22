// lib/db/sources.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { resolveSourceIds, getEnabledSourceIds } from "./sources";
import { getDb, closeDb } from "./client";
import { runMigrations } from "./migrate";
import { sourcesTable } from "./schema";
import * as configSourcesModule from "../config/sources";

const testDbPath = "data/test-db-sources.db";

describe("resolveSourceIds", () => {
  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("creates a row for a new name and returns its id", async () => {
    const result = await resolveSourceIds(["Hacker News"]);

    expect(result.get("Hacker News")).toBeTypeOf("number");
    const db = getDb();
    const rows = await db.select().from(sourcesTable);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Hacker News");
  });

  it("returns the existing id on a repeat call without duplicating the row", async () => {
    const first = await resolveSourceIds(["Hacker News"]);
    const second = await resolveSourceIds(["Hacker News"]);

    expect(second.get("Hacker News")).toBe(first.get("Hacker News"));
    const db = getDb();
    expect(await db.select().from(sourcesTable)).toHaveLength(1);
  });

  it("dedups names within a single call", async () => {
    await resolveSourceIds(["Hacker News", "Hacker News", "The Verge"]);

    const db = getDb();
    const rows = await db.select().from(sourcesTable);
    expect(rows).toHaveLength(2);
  });

  it("returns an empty map for an empty input", async () => {
    const result = await resolveSourceIds([]);
    expect(result.size).toBe(0);
  });
});

describe("getEnabledSourceIds", () => {
  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("excludes a disabled source's id even though its row exists in sourcesTable", async () => {
    const ids = await resolveSourceIds(["Enabled Source", "Disabled Source"]);
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Enabled Source", url: "https://a.test", category: "c", enabled: true },
      { name: "Disabled Source", url: "https://b.test", category: "c", enabled: false },
    ]);

    const enabledIds = await getEnabledSourceIds();

    expect(enabledIds).toEqual([ids.get("Enabled Source")]);
  });

  it("returns an empty array when nothing is enabled", async () => {
    await resolveSourceIds(["Some Source"]);
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([
      { name: "Some Source", url: "https://a.test", category: "c", enabled: false },
    ]);

    expect(await getEnabledSourceIds()).toEqual([]);
  });

  it("returns an empty array without querying the DB when config has zero sources", async () => {
    vi.spyOn(configSourcesModule, "getSources").mockResolvedValue([]);
    expect(await getEnabledSourceIds()).toEqual([]);
  });
});
