// scripts/view-posts.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { formatPosts } from "./view-posts";
import { getDb, closeDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable } from "../lib/db/schema";

const testDbPath = "data/test-view-posts.db";

describe("formatPosts", () => {
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

  it("reports no posts yet when the table is empty", async () => {
    const output = await formatPosts();
    expect(output).toBe("No posts yet. Run `npm run pipeline` first.");
  });

  it("prints post text, source URL, image prompt, and flags, preferring edited text", async () => {
    const db = getDb();
    const [run] = await db
      .insert(pipelineRunsTable)
      .values({ startedAt: new Date(), type: "manual" })
      .returning({ id: pipelineRunsTable.id });
    const [candidate] = await db
      .insert(candidatesTable)
      .values({ runId: run.id, url: "https://example.com/a", sourceRecap: "r", createdAt: new Date() })
      .returning({ id: candidatesTable.id });
    await db.insert(postsTable).values({
      candidateId: candidate.id,
      runId: run.id,
      url: "https://example.com/a",
      originalText: "original draft",
      editedText: "edited version",
      imagePrompt: "a robot reading news",
      discarded: false,
      posted: true,
    });

    const output = await formatPosts();

    expect(output).toContain(`Run #${run.id} (manual`);
    expect(output).toContain("https://example.com/a");
    expect(output).toContain("a robot reading news");
    expect(output).toContain("edited version");
    expect(output).not.toContain("original draft");
    expect(output).toContain("[POSTED]");
  });
});
