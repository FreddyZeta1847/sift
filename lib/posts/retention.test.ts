// lib/posts/retention.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { pruneStalePosts } from "./retention";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../db/schema";
import * as settingsModule from "../config/settings";

const testDbPath = "data/test-posts-retention.db";
const DAY_MS = 24 * 60 * 60 * 1000;

function settingsWithRetention(postsRetentionDays: number | null) {
  return {
    budgetCapUsd: null,
    postsRetentionDays,
    candidateRetentionDays: null,
    scheduleDays: [],
    scheduleTime: "09:00",
    voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
    curationProviderId: null,
    curationModel: null,
    draftingProviderId: null,
    draftingModel: null,
    curationTopN: 3,
  };
}

describe("pruneStalePosts", () => {
  async function makeRunAndPost(startedAt: Date, overrides: Partial<typeof postsTable.$inferInsert> = {}) {
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt, type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: startedAt })
      .returning({ id: candidatesTable.id });
    const [post] = await db
      .insert(postsTable)
      .values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p", ...overrides })
      .returning({ id: postsTable.id });
    return { runId: run.id, postId: post.id };
  }

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

  it("does nothing when postsRetentionDays is null (default, off)", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue(settingsWithRetention(null));
    await makeRunAndPost(new Date(Date.now() - 365 * DAY_MS));

    const result = await pruneStalePosts();

    expect(result).toEqual({ deleted: 0 });
    const db = getDb();
    expect(await db.select().from(postsTable)).toHaveLength(1);
  });

  it("deletes posts whose run is older than the configured retention window", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue(settingsWithRetention(7));
    const { postId: oldId } = await makeRunAndPost(new Date(Date.now() - 10 * DAY_MS));
    const { postId: freshId } = await makeRunAndPost(new Date(Date.now() - 1 * DAY_MS));

    const result = await pruneStalePosts();

    expect(result).toEqual({ deleted: 1 });
    const db = getDb();
    const remaining = await db.select().from(postsTable);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(freshId);
    expect(remaining.some((p) => p.id === oldId)).toBe(false);
  });

  it("prunes a posted post identically to an untouched one at the same age", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue(settingsWithRetention(7));
    await makeRunAndPost(new Date(Date.now() - 10 * DAY_MS), { posted: true, postedAt: new Date(Date.now() - 9 * DAY_MS) });

    const result = await pruneStalePosts();

    expect(result).toEqual({ deleted: 1 });
    const db = getDb();
    expect(await db.select().from(postsTable)).toHaveLength(0);
  });
});
