import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { saveEdit, discardPost, markPosted } from "./actions";
import { getDb, closeDb } from "../../lib/db/client";
import { runMigrations } from "../../lib/db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../../lib/db/schema";

const testDbPath = "data/test-review-actions.db";

describe("review actions", () => {
  let postId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db.insert(candidatesTable).values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() }).returning({ id: candidatesTable.id });
    const [post] = await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "original", imagePrompt: "p" }).returning({ id: postsTable.id });
    postId = post.id;
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("saveEdit writes editedText", async () => {
    const result = await saveEdit(postId, "edited version");
    expect(result.ok).toBe(true);
    const db = getDb();
    const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(row.editedText).toBe("edited version");
  });

  it("discardPost sets discarded=true", async () => {
    const result = await discardPost(postId);
    expect(result.ok).toBe(true);
    const db = getDb();
    const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(row.discarded).toBe(true);
  });

  it("markPosted sets posted=true and postedAt", async () => {
    const result = await markPosted(postId);
    expect(result.ok).toBe(true);
    const db = getDb();
    const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    expect(row.posted).toBe(true);
    expect(row.postedAt).not.toBeNull();
  });

  it("discardPost refuses to write when the post is already marked posted", async () => {
    const setup = await markPosted(postId);
    expect(setup.ok).toBe(true);

    const result = await discardPost(postId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already marked posted/i);

    const db = getDb();
    const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    // Still posted, and NOT also discarded — the invalid combined state was never written.
    expect(row.posted).toBe(true);
    expect(row.discarded).toBe(false);
  });

  it("markPosted refuses to write when the post is already discarded", async () => {
    const setup = await discardPost(postId);
    expect(setup.ok).toBe(true);

    const result = await markPosted(postId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already discarded|discarded post/i);

    const db = getDb();
    const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
    // Still discarded, and NOT also posted — the invalid combined state was never written.
    expect(row.discarded).toBe(true);
    expect(row.posted).toBe(false);
  });

  it("retries once on a transient write failure and still succeeds", async () => {
    const db = getDb();
    const originalUpdate = db.update.bind(db);
    let calls = 0;
    const updateSpy = vi.spyOn(db, "update").mockImplementation((...args: Parameters<typeof db.update>) => {
      calls += 1;
      if (calls === 1) {
        throw new Error("SQLITE_BUSY: database is locked");
      }
      return originalUpdate(...args);
    });

    try {
      const result = await saveEdit(postId, "retried edit");
      expect(result.ok).toBe(true);
      expect(calls).toBe(2);

      const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
      expect(row.editedText).toBe("retried edit");
    } finally {
      updateSpy.mockRestore();
    }
  });

  it("surfaces an error when the write fails twice in a row (retry exhausted)", async () => {
    const db = getDb();
    const updateSpy = vi.spyOn(db, "update").mockImplementation(() => {
      throw new Error("SQLITE_BUSY: database is locked");
    });

    try {
      const result = await saveEdit(postId, "should not persist");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/locked/i);
    } finally {
      updateSpy.mockRestore();
    }
  });
});
