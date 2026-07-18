// lib/candidates/retention.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { pruneStaleCandidates } from "./retention";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable } from "../db/schema";
import * as settingsModule from "../config/settings";

const testDbPath = "data/test-candidate-retention.db";
const DAY_MS = 24 * 60 * 60 * 1000;

function settingsWithRetention(candidateRetentionDays: number | null) {
  return {
    budgetCapUsd: null,
    postsRetentionRuns: null,
    candidateRetentionDays,
    scheduleDays: [],
    scheduleTime: "09:00",
    voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
    curationProviderId: null,
    curationModel: null,
    draftingProviderId: null,
    draftingModel: null,
  };
}

describe("pruneStaleCandidates", () => {
  let runId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
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

  it("does nothing when candidateRetentionDays is null (default, off)", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue(settingsWithRetention(null));
    const db = getDb();
    await db.insert(candidatesTable).values({
      runId,
      url: "https://old.test/1",
      sourceRecap: "old",
      chosen: false,
      createdAt: new Date(Date.now() - 30 * DAY_MS),
    });

    const result = await pruneStaleCandidates();

    expect(result).toEqual({ deleted: 0 });
    const remaining = await db.select().from(candidatesTable);
    expect(remaining).toHaveLength(1);
  });

  it("deletes unchosen candidates older than the configured retention window", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue(settingsWithRetention(7));
    const db = getDb();
    await db.insert(candidatesTable).values([
      { runId, url: "https://old.test/1", sourceRecap: "old", chosen: false, createdAt: new Date(Date.now() - 10 * DAY_MS) },
      { runId, url: "https://fresh.test/1", sourceRecap: "fresh", chosen: false, createdAt: new Date(Date.now() - 1 * DAY_MS) },
    ]);

    const result = await pruneStaleCandidates();

    expect(result).toEqual({ deleted: 1 });
    const remaining = await db.select().from(candidatesTable);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].url).toBe("https://fresh.test/1");
  });

  it("never deletes a chosen candidate, regardless of age", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue(settingsWithRetention(7));
    const db = getDb();
    await db.insert(candidatesTable).values({
      runId,
      url: "https://old-but-chosen.test/1",
      sourceRecap: "old but chosen",
      chosen: true,
      createdAt: new Date(Date.now() - 365 * DAY_MS),
    });

    const result = await pruneStaleCandidates();

    expect(result).toEqual({ deleted: 0 });
    const remaining = await db.select().from(candidatesTable).where(eq(candidatesTable.chosen, true));
    expect(remaining).toHaveLength(1);
  });
});
