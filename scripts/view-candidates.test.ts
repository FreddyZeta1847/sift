// scripts/view-candidates.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { formatCandidatesTable, getCandidatesForDisplay } from "./view-candidates";
import { getDb, closeDb } from "../lib/db/client";
import { runMigrations } from "../lib/db/migrate";
import { pipelineRunsTable, candidatesTable } from "../lib/db/schema";

const testDbPath = "data/test-view-candidates.db";

describe("view-candidates", () => {
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
    for (const suffix of ["", "-wal", "-shm"]) {
      if (existsSync(testDbPath + suffix)) rmSync(testDbPath + suffix);
    }
  });

  it("reports no candidates yet when the table is empty", async () => {
    const output = await formatCandidatesTable();
    expect(output).toBe("No candidates yet. Run `npm run pipeline` first.");
  });

  it("prints a table with id, chosen flag, run, host, and a truncated recap", async () => {
    const db = getDb();
    await db.insert(candidatesTable).values({
      runId,
      url: "https://spectrum.ieee.org/some-long-path-here",
      sourceRecap: "A".repeat(100),
      chosen: true,
      createdAt: new Date("2026-07-17T20:00:00.000Z"),
    });

    const output = await formatCandidatesTable();

    expect(output).toContain("ID");
    expect(output).toContain("CHOSEN");
    expect(output).toContain("yes");
    expect(output).toContain(String(runId));
    expect(output).toContain("spectrum.ieee.org");
    expect(output).toContain("2026-07-17 20:00");
    expect(output).toContain("…");
    expect(output).not.toContain("A".repeat(100));
  });

  it("getCandidatesForDisplay returns raw rows suitable for --json output", async () => {
    const db = getDb();
    await db.insert(candidatesTable).values({
      runId,
      url: "https://example.test/a",
      sourceRecap: "recap",
      chosen: false,
      createdAt: new Date(),
    });

    const rows = await getCandidatesForDisplay();

    expect(rows).toHaveLength(1);
    expect(rows[0].url).toBe("https://example.test/a");
  });
});
