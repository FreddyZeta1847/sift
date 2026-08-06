/**
 * Tests for app/review/actions.ts — the Review Workspace's "use server"
 * wrapper. Covers saveEdit/discardPost/markPosted's own contracts, the
 * saveEdit-triggers-outdated-flip behavior added for PHASE-6 TRANSLATION,
 * and that regeneratePost/keepVersion/translatePost/saveTranslationEdit are
 * all present as real wrapped exports (not bare re-exports, which Next's
 * "use server" compiler rejects — see actions.ts's header).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { eq } from "drizzle-orm";
import { saveEdit, discardPost, markPosted, translatePost, saveTranslationEdit } from "./actions";
import { getDb, closeDb } from "../../lib/db/client";
import { runMigrations } from "../../lib/db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable, postTranslationsTable } from "../../lib/db/schema";
import * as translateModule from "../../lib/translation/translate";

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
      // 2 calls for the editedText write itself (1 failure + 1 successful
      // retry), plus 1 more for the markTranslationsOutdated flip that
      // saveEdit fires once that write succeeds (see saveEdit's header) —
      // that third call also goes through this same spied db.update.
      expect(calls).toBe(3);

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

  it("re-exports regeneratePost and keepVersion", async () => {
    const mod = await import("./actions");
    expect(typeof mod.regeneratePost).toBe("function");
    expect(typeof mod.keepVersion).toBe("function");
  });

  it("saveEdit flips outdated=true on every existing post_translations row for the post", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values([
      { postId, language: "es", translatedText: "hola", outdated: false, createdAt: new Date(), updatedAt: new Date() },
      { postId, language: "fr", translatedText: "bonjour", outdated: false, createdAt: new Date(), updatedAt: new Date() },
    ]);

    const result = await saveEdit(postId, "edited version");

    expect(result.ok).toBe(true);
    const rows = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(rows.every((r) => r.outdated)).toBe(true);
  });

  it("saveEdit is a no-op on post_translations when the post has no translations yet", async () => {
    const result = await saveEdit(postId, "edited version");

    expect(result.ok).toBe(true);
    const db = getDb();
    expect(await db.select().from(postTranslationsTable)).toHaveLength(0);
  });

  it("translatePost is wrapped and upserts a translation via lib/translation/actions.ts", async () => {
    const translateSpy = vi.spyOn(translateModule, "translate").mockResolvedValue("hola");

    const result = await translatePost(postId, "es");

    expect(result.ok).toBe(true);
    const db = getDb();
    const [row] = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(row.translatedText).toBe("hola");
    translateSpy.mockRestore();
  });

  it("saveTranslationEdit is wrapped and updates an existing translation row", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values({
      postId,
      language: "es",
      translatedText: "hola",
      outdated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await saveTranslationEdit(postId, "es", "hola editado");

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(row.translatedText).toBe("hola editado");
  });
});
