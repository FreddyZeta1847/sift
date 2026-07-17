import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
});
