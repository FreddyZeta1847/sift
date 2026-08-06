/**
 * Tests for lib/translation/actions.ts — the DB-writing half of local
 * translation. Mocks lib/translation/translate.ts's translate() throughout
 * so these tests never spawn a real worker_thread or run inference; they
 * exercise the upsert / no-row-on-failure / outdated-flip / edit-autosave
 * contracts documented in that module's header.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { translatePost, saveTranslationEdit, markTranslationsOutdated } from "./actions";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable, postTranslationsTable } from "../db/schema";
import * as translateModule from "./translate";
import { TranslationError, TranslationUnavailableError } from "./translate";

const testDbPath = "data/test-translation-actions.db";

describe("translatePost / saveTranslationEdit / markTranslationsOutdated", () => {
  let postId: number;

  beforeEach(async () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    const db = getDb();
    const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    const [post] = await db
      .insert(postsTable)
      .values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "hello", imagePrompt: "p" })
      .returning({ id: postsTable.id });
    postId = post.id;
  });

  afterEach(() => {
    closeDb();
    delete process.env.SIFT_DB_PATH;
    vi.restoreAllMocks();
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("translatePost inserts a new row when none exists yet", async () => {
    vi.spyOn(translateModule, "translate").mockResolvedValue("hola");

    const result = await translatePost(postId, "es");

    expect(result.ok).toBe(true);
    const db = getDb();
    const [row] = await db
      .select()
      .from(postTranslationsTable)
      .where(and(eq(postTranslationsTable.postId, postId), eq(postTranslationsTable.language, "es")));
    expect(row.translatedText).toBe("hola");
    expect(row.outdated).toBe(false);
  });

  it("translatePost uses editedText over originalText when both are present", async () => {
    const db = getDb();
    await db.update(postsTable).set({ editedText: "edited hello" }).where(eq(postsTable.id, postId));
    const translateSpy = vi.spyOn(translateModule, "translate").mockResolvedValue("hola editado");

    await translatePost(postId, "es");

    expect(translateSpy).toHaveBeenCalledWith("edited hello", "es");
  });

  it("translatePost falls back to originalText when there is no edit", async () => {
    const translateSpy = vi.spyOn(translateModule, "translate").mockResolvedValue("hola");

    await translatePost(postId, "es");

    expect(translateSpy).toHaveBeenCalledWith("hello", "es");
  });

  it("translatePost overwrites translatedText and clears outdated on an existing row, in place (no second row)", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values({
      postId,
      language: "es",
      translatedText: "old",
      outdated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.spyOn(translateModule, "translate").mockResolvedValue("nuevo");

    const result = await translatePost(postId, "es");

    expect(result.ok).toBe(true);
    const rows = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(rows).toHaveLength(1);
    expect(rows[0].translatedText).toBe("nuevo");
    expect(rows[0].outdated).toBe(false);
  });

  it("translatePost writes no row at all when translate() fails with a TranslationError", async () => {
    vi.spyOn(translateModule, "translate").mockRejectedValue(new TranslationError("worker crashed"));

    const result = await translatePost(postId, "fr");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/worker crashed/);
    const db = getDb();
    expect(await db.select().from(postTranslationsTable)).toHaveLength(0);
  });

  it("translatePost surfaces TranslationUnavailableError without writing a row", async () => {
    vi.spyOn(translateModule, "translate").mockRejectedValue(new TranslationUnavailableError("pt"));

    const result = await translatePost(postId, "pt");

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available/i);
    const db = getDb();
    expect(await db.select().from(postTranslationsTable)).toHaveLength(0);
  });

  it("translatePost returns an error for a non-existent post and never calls translate()", async () => {
    const translateSpy = vi.spyOn(translateModule, "translate");

    const result = await translatePost(999999, "es");

    expect(result.ok).toBe(false);
    expect(translateSpy).not.toHaveBeenCalled();
  });

  it("saveTranslationEdit updates translatedText without touching outdated", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values({
      postId,
      language: "es",
      translatedText: "hola",
      outdated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await saveTranslationEdit(postId, "es", "hola corregido");

    expect(result.ok).toBe(true);
    const [row] = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(row.translatedText).toBe("hola corregido");
    expect(row.outdated).toBe(false);
  });

  it("saveTranslationEdit does not clear an existing outdated=true flag", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values({
      postId,
      language: "es",
      translatedText: "hola",
      outdated: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await saveTranslationEdit(postId, "es", "hola corregido");

    const [row] = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(row.outdated).toBe(true);
  });

  it("saveTranslationEdit retries once on a transient write failure and still succeeds", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values({
      postId,
      language: "es",
      translatedText: "hola",
      outdated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
      const result = await saveTranslationEdit(postId, "es", "retried edit");
      expect(result.ok).toBe(true);
      expect(calls).toBe(2);

      const [row] = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
      expect(row.translatedText).toBe("retried edit");
    } finally {
      updateSpy.mockRestore();
    }
  });

  it("saveTranslationEdit surfaces an error when the write fails twice in a row (retry exhausted)", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values({
      postId,
      language: "es",
      translatedText: "hola",
      outdated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const updateSpy = vi.spyOn(db, "update").mockImplementation(() => {
      throw new Error("SQLITE_BUSY: database is locked");
    });

    try {
      const result = await saveTranslationEdit(postId, "es", "should not persist");
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/locked/i);
    } finally {
      updateSpy.mockRestore();
    }
  });

  it("markTranslationsOutdated flips outdated=true for every language row of a post", async () => {
    const db = getDb();
    await db.insert(postTranslationsTable).values([
      { postId, language: "es", translatedText: "hola", outdated: false, createdAt: new Date(), updatedAt: new Date() },
      { postId, language: "fr", translatedText: "bonjour", outdated: false, createdAt: new Date(), updatedAt: new Date() },
    ]);

    await markTranslationsOutdated(postId);

    const rows = await db.select().from(postTranslationsTable).where(eq(postTranslationsTable.postId, postId));
    expect(rows.every((r) => r.outdated)).toBe(true);
  });
});
