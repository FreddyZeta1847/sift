/**
 * Tests for the Admin page's read-only list/search/paginate layer
 * (lib/admin/queries.ts) — one describe block per table (runs, candidates,
 * posts, llm calls, the all-sources lookup), each against a real throwaway
 * SQLite file so filtering/pagination/joins are exercised against actual
 * SQL rather than mocked query builders.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { listRuns, listCandidates, listPosts, listLlmCalls, listAllSources } from "./queries";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable, sourcesTable } from "../db/schema";

const testDbPath = "data/test-admin-queries.db";

describe("admin queries", () => {
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

  describe("listRuns", () => {
    it("returns rows newest-first with pagination metadata", async () => {
      const db = getDb();
      for (let i = 0; i < 3; i++) {
        await db.insert(pipelineRunsTable).values({ startedAt: new Date(Date.now() + i * 1000), type: "manual" });
      }

      const result = await listRuns({});

      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.rows[0].id).toBeGreaterThan(result.rows[1].id);
    });

    it("filters by id, short-circuiting other filters", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "scheduled" });

      const result = await listRuns({ id: run.id, type: "scheduled" });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(run.id);
    });

    it("filters by type and by status, including incomplete (null status)", async () => {
      const db = getDb();
      await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual", status: "success", finishedAt: new Date() });
      await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual", status: "aborted", abortReason: "api_error", finishedAt: new Date() });
      await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "scheduled" });

      expect((await listRuns({ type: "scheduled" })).total).toBe(1);
      expect((await listRuns({ status: "success" })).total).toBe(1);
      expect((await listRuns({ status: "aborted" })).total).toBe(1);
      expect((await listRuns({ status: "incomplete" })).total).toBe(1);
    });

    it("filters by date range", async () => {
      const db = getDb();
      await db.insert(pipelineRunsTable).values({ startedAt: new Date("2026-07-18T10:00:00.000Z"), type: "manual" });
      await db.insert(pipelineRunsTable).values({ startedAt: new Date("2026-07-19T10:00:00.000Z"), type: "manual" });

      const result = await listRuns({ date: "2026-07-18" });

      expect(result.total).toBe(1);
    });

    it("paginates", async () => {
      const db = getDb();
      for (let i = 0; i < 30; i++) {
        await db.insert(pipelineRunsTable).values({ startedAt: new Date(Date.now() + i * 1000), type: "manual" });
      }

      const page1 = await listRuns({ page: 1 });
      const page2 = await listRuns({ page: 2 });

      expect(page1.rows).toHaveLength(25);
      expect(page2.rows).toHaveLength(5);
      expect(page1.total).toBe(30);
    });

    it("returns an empty page for no matches", async () => {
      const result = await listRuns({ type: "manual" });
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("listCandidates", () => {
    it("filters by runId, chosen, and q, and reports hasPost correctly", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      const [withPost] = await db
        .insert(candidatesTable)
        .values({ runId: run.id, url: "https://kimi-k3.test/paper", sourceRecap: "Kimi K3 release", chosen: true, createdAt: new Date() })
        .returning({ id: candidatesTable.id });
      await db.insert(postsTable).values({ candidateId: withPost.id, runId: run.id, url: "https://kimi-k3.test/paper", originalText: "x", imagePrompt: "p" });
      await db.insert(candidatesTable).values({ runId: run.id, url: "https://other.test", sourceRecap: "unrelated", chosen: false, createdAt: new Date() });

      const byRun = await listCandidates({ runId: run.id });
      expect(byRun.total).toBe(2);

      const chosenOnly = await listCandidates({ chosen: true });
      expect(chosenOnly.total).toBe(1);

      const byQ = await listCandidates({ q: "kimi" });
      expect(byQ.total).toBe(1);
      expect(byQ.rows[0].hasPost).toBe(true);

      const unrelated = await listCandidates({ q: "unrelated" });
      expect(unrelated.rows[0].hasPost).toBe(false);
    });

    it("filters by id", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      const [candidate] = await db
        .insert(candidatesTable)
        .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: false, createdAt: new Date() })
        .returning({ id: candidatesTable.id });

      const result = await listCandidates({ id: candidate.id });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(candidate.id);
    });

    it("filters by sourceId and resolves sourceName, with sourceName null when sourceId is null", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      const [source] = await db.insert(sourcesTable).values({ name: "Hacker News" }).returning({ id: sourcesTable.id });
      await db.insert(candidatesTable).values([
        { runId: run.id, url: "https://a.test", sourceRecap: "r", sourceId: source.id, chosen: false, createdAt: new Date() },
        { runId: run.id, url: "https://b.test", sourceRecap: "r", sourceId: null, chosen: false, createdAt: new Date() },
      ]);

      const bySource = await listCandidates({ sourceId: source.id });
      expect(bySource.total).toBe(1);
      expect(bySource.rows[0].sourceName).toBe("Hacker News");

      const withoutSource = await listCandidates({ sourceId: undefined });
      const legacyRow = withoutSource.rows.find((r) => r.sourceId === null);
      expect(legacyRow?.sourceName).toBeNull();
    });
  });

  describe("listAllSources", () => {
    it("returns all sources ordered by name", async () => {
      const db = getDb();
      await db.insert(sourcesTable).values([{ name: "The Verge" }, { name: "Hacker News" }]);

      const result = await listAllSources();

      expect(result.map((s) => s.name)).toEqual(["Hacker News", "The Verge"]);
    });

    it("returns an empty array when there are no sources", async () => {
      expect(await listAllSources()).toEqual([]);
    });
  });

  describe("listPosts", () => {
    it("filters by runId, posted, discarded, and q over title/url/text", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      const [c1] = await db.insert(candidatesTable).values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() }).returning({ id: candidatesTable.id });
      const [c2] = await db.insert(candidatesTable).values({ runId: run.id, url: "https://b.test", sourceRecap: "r", chosen: true, createdAt: new Date() }).returning({ id: candidatesTable.id });
      await db.insert(postsTable).values({ candidateId: c1.id, runId: run.id, url: "https://a.test", title: "MCPEvol-Bench results", originalText: "text a", imagePrompt: "p", posted: true, postedAt: new Date() });
      await db.insert(postsTable).values({ candidateId: c2.id, runId: run.id, url: "https://b.test", title: "unrelated", originalText: "text b", imagePrompt: "p", discarded: true });

      expect((await listPosts({ posted: true })).total).toBe(1);
      expect((await listPosts({ discarded: true })).total).toBe(1);
      expect((await listPosts({ q: "MCPEvol" })).total).toBe(1);
      expect((await listPosts({ runId: run.id })).total).toBe(2);
    });

    it("filters by id", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      const [candidate] = await db.insert(candidatesTable).values({ runId: run.id, url: "https://a.test", sourceRecap: "r", chosen: true, createdAt: new Date() }).returning({ id: candidatesTable.id });
      const [post] = await db.insert(postsTable).values({ candidateId: candidate.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p" }).returning({ id: postsTable.id });

      const result = await listPosts({ id: post.id });

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe(post.id);
    });

    it("resolves sourceName two hops out via the post's candidate, null when the candidate has no source", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      const [source] = await db.insert(sourcesTable).values({ name: "Hacker News" }).returning({ id: sourcesTable.id });
      const [withSource] = await db
        .insert(candidatesTable)
        .values({ runId: run.id, url: "https://a.test", sourceRecap: "r", sourceId: source.id, chosen: true, createdAt: new Date() })
        .returning({ id: candidatesTable.id });
      const [withoutSource] = await db
        .insert(candidatesTable)
        .values({ runId: run.id, url: "https://b.test", sourceRecap: "r", sourceId: null, chosen: true, createdAt: new Date() })
        .returning({ id: candidatesTable.id });
      await db.insert(postsTable).values({ candidateId: withSource.id, runId: run.id, url: "https://a.test", originalText: "x", imagePrompt: "p" });
      await db.insert(postsTable).values({ candidateId: withoutSource.id, runId: run.id, url: "https://b.test", originalText: "y", imagePrompt: "p" });

      const result = await listPosts({ runId: run.id });

      expect(result.rows.find((r) => r.url === "https://a.test")?.sourceName).toBe("Hacker News");
      expect(result.rows.find((r) => r.url === "https://b.test")?.sourceName).toBeNull();
    });
  });

  describe("listLlmCalls", () => {
    it("filters by runId, provider, and model", async () => {
      const db = getDb();
      const [run] = await db.insert(pipelineRunsTable).values({ startedAt: new Date(), type: "manual" }).returning({ id: pipelineRunsTable.id });
      await db.insert(llmCallsTable).values({ timestamp: new Date(), runId: run.id, provider: "nvidia-nim", model: "z-ai/glm-5.2", inputTokens: 1, outputTokens: 1, estimatedCost: 0 });
      await db.insert(llmCallsTable).values({ timestamp: new Date(), runId: run.id, provider: "anthropic", model: "claude", inputTokens: 1, outputTokens: 1, estimatedCost: 0 });

      expect((await listLlmCalls({ runId: run.id })).total).toBe(2);
      expect((await listLlmCalls({ provider: "nvidia-nim" })).total).toBe(1);
      expect((await listLlmCalls({ model: "claude" })).total).toBe(1);
    });

    it("returns an empty page when there are no calls", async () => {
      const result = await listLlmCalls({});
      expect(result.rows).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
