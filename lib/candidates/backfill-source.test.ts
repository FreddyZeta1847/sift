// lib/candidates/backfill-source.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { parseSourceFromRecap, backfillCandidateSourceIds } from "./backfill-source";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, sourcesTable } from "../db/schema";

describe("parseSourceFromRecap", () => {
  it("parses a well-formed recap", () => {
    expect(parseSourceFromRecap("A Title — Hacker News (general-tech): a summary")).toBe("Hacker News");
  });

  it("returns null when there's no (category) section", () => {
    expect(parseSourceFromRecap("A Title — Hacker News: a summary")).toBeNull();
  });

  it("returns null when there's no ' — ' separator", () => {
    expect(parseSourceFromRecap("A Title Hacker News (general-tech): a summary")).toBeNull();
  });

  it("resolves the true trailing source name even when the title contains its own ' — '", () => {
    const recap = "Before — After Title — Hacker News (general-tech): a summary";
    expect(parseSourceFromRecap(recap)).toBe("Hacker News");
  });

  it("parses correctly even when the title contains an embedded U+2028 line separator", () => {
    // Reproduces a real production case: Readability/RSS extraction can
    // insert a U+2028 LINE SEPARATOR mid-title — invisible in a terminal,
    // but a plain (non-dotall) `.` regex refuses to cross it, which
    // previously caused this exact shape of recap to fail to parse.
    const recap = "Attack Channel Hijacked — The Hacker News (cybersecurity): a summary";
    expect(parseSourceFromRecap(recap)).toBe("The Hacker News");
  });
});

describe("backfillCandidateSourceIds", () => {
  const testDbPath = "data/test-backfill-source.db";

  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("sets sourceId for parseable rows sharing a source, creating only one sourcesTable row", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values([
      { runId: run.id, url: "https://a.test/1", sourceRecap: "Title A — Hacker News (general-tech): summary a", chosen: false, createdAt: new Date() },
      { runId: run.id, url: "https://a.test/2", sourceRecap: "Title B — Hacker News (general-tech): summary b", chosen: false, createdAt: new Date() },
    ]);

    const result = await backfillCandidateSourceIds();

    expect(result.updated).toBe(2);
    expect(result.skipped).toBe(0);
    const sources = await db.select().from(sourcesTable);
    expect(sources).toHaveLength(1);
    expect(sources[0].name).toBe("Hacker News");
    const rows = await db.select().from(candidatesTable);
    expect(rows.every((r) => r.sourceId === sources[0].id)).toBe(true);
  });

  it("leaves a malformed row's sourceId null", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values({
      runId: run.id,
      url: "https://a.test/1",
      sourceRecap: "not a parseable recap at all",
      chosen: false,
      createdAt: new Date(),
    });

    const result = await backfillCandidateSourceIds();

    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    const [row] = await db.select().from(candidatesTable);
    expect(row.sourceId).toBeNull();
  });

  it("is idempotent — a second call is a no-op", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    await db.insert(candidatesTable).values({
      runId: run.id,
      url: "https://a.test/1",
      sourceRecap: "Title A — Hacker News (general-tech): summary a",
      chosen: false,
      createdAt: new Date(),
    });

    await backfillCandidateSourceIds();
    const second = await backfillCandidateSourceIds();

    expect(second).toEqual({ updated: 0, skipped: 0 });
  });

  it("never touches an already-non-null sourceId", async () => {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [existingSource] = await db.insert(sourcesTable).values({ name: "Manually Set" }).returning({ id: sourcesTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({
        runId: run.id,
        url: "https://a.test/1",
        sourceRecap: "Title A — Hacker News (general-tech): summary a",
        sourceId: existingSource.id,
        chosen: false,
        createdAt: new Date(),
      })
      .returning({ id: candidatesTable.id });

    await backfillCandidateSourceIds();

    const [row] = await db.select().from(candidatesTable).where(eq(candidatesTable.id, candidate.id));
    expect(row.sourceId).toBe(existingSource.id);
  });

  it("returns {updated: 0, skipped: 0} when there are no candidates at all", async () => {
    expect(await backfillCandidateSourceIds()).toEqual({ updated: 0, skipped: 0 });
  });
});
