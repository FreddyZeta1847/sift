import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { runIngestion } from "./run";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable } from "../db/schema";
import type { Source } from "../config/types";
import * as fetchModule from "./fetch";
import * as rateLimitModule from "./rate-limit";

const testDbPath = "data/test-ingestion-run.db";

describe("runIngestion", () => {
  let runId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    vi.spyOn(rateLimitModule, "delayBetweenFetches").mockResolvedValue(undefined);
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    runId = run.id;
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("writes surviving items into candidates tagged with runId", async () => {
    vi.spyOn(fetchModule, "fetchSource")
      .mockResolvedValueOnce([{ title: "Item from A", link: "https://example.test/A", summary: "s" }])
      .mockResolvedValueOnce([{ title: "Item from B", link: "https://example.test/B", summary: "s" }]);
    const sources: Source[] = [
      { name: "A", url: "https://a.test/feed", category: "ai-ml", enabled: true },
      { name: "B", url: "https://b.test/feed", category: "cybersecurity", enabled: true },
    ];

    const result = await runIngestion(sources, runId);

    expect(result.written).toBe(2);
    expect(result.perSource).toEqual(
      expect.arrayContaining([
        { source: "A", fetched: 1, written: 1 },
        { source: "B", fetched: 1, written: 1 },
      ])
    );
    const db = getDb();
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.runId, runId));
    expect(rows).toHaveLength(2);
    expect(rows[0].sourceRecap).toContain("Item from");
  });

  it("skips items whose url already exists in candidates from a prior run", async () => {
    const db = getDb();
    const [priorRun] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values({ runId: priorRun.id, url: "https://example.test/A", sourceRecap: "old", chosen: false, createdAt: new Date() });

    vi.spyOn(fetchModule, "fetchSource").mockResolvedValue([{ title: "Item A", link: "https://example.test/A", summary: "s" }]);
    const sources: Source[] = [{ name: "A", url: "https://a.test/feed", category: "ai-ml", enabled: true }];

    const result = await runIngestion(sources, runId);

    expect(result.written).toBe(0);
  });

  it("skips a source that fails to fetch and continues with the rest", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(fetchModule, "fetchSource")
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce([{ title: "Item B", link: "https://example.test/B", summary: "s" }]);
    const sources: Source[] = [
      { name: "Dead", url: "https://dead.test/feed", category: "ai-ml", enabled: true },
      { name: "Alive", url: "https://alive.test/feed", category: "ai-ml", enabled: true },
    ];

    const result = await runIngestion(sources, runId);

    expect(result.written).toBe(1);
    expect(result.skippedSources).toEqual(["Dead"]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Dead"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network error"));
    expect(result.perSource).toEqual(
      expect.arrayContaining([
        { source: "Dead", fetched: 0, written: 0 },
        { source: "Alive", fetched: 1, written: 1 },
      ])
    );
  });

  it("deduplicates items with the same url returned by two different sources in the same run", async () => {
    vi.spyOn(fetchModule, "fetchSource")
      .mockResolvedValueOnce([{ title: "Item from A", link: "https://example.test/dupe", summary: "s" }])
      .mockResolvedValueOnce([{ title: "Item from B", link: "https://example.test/dupe", summary: "s" }]);
    const sources: Source[] = [
      { name: "A", url: "https://a.test/feed", category: "ai-ml", enabled: true },
      { name: "B", url: "https://b.test/feed", category: "cybersecurity", enabled: true },
    ];

    const result = await runIngestion(sources, runId);

    expect(result.written).toBe(1);
    const db = getDb();
    const rows = await db
      .select()
      .from(candidatesTable)
      .where(eq(candidatesTable.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe("https://example.test/dupe");
  });

  it("only fetches enabled sources", async () => {
    const fetchSpy = vi.spyOn(fetchModule, "fetchSource").mockResolvedValue([]);
    const sources: Source[] = [
      { name: "On", url: "https://on.test/feed", category: "ai-ml", enabled: true },
      { name: "Off", url: "https://off.test/feed", category: "ai-ml", enabled: false },
    ];

    await runIngestion(sources, runId);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
