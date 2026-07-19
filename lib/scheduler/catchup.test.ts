import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { mostRecentExpectedSlot, checkMissedRun } from "./catchup";
import { getDb, closeDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { pipelineRunsTable } from "../db/schema";
import * as settingsModule from "../config/settings";
import * as triggerModule from "./trigger";

describe("mostRecentExpectedSlot", () => {
  it("returns null when scheduleDays is empty", () => {
    expect(mostRecentExpectedSlot([], "09:00", new Date("2026-07-19T12:00:00.000Z"))).toBeNull();
  });

  it("finds today's slot when now is after today's scheduled time and today is a scheduled day", () => {
    // 2026-07-19 is a Sunday
    const now = new Date("2026-07-19T15:00:00.000Z");
    const slot = mostRecentExpectedSlot(["sun"], "09:00", now);
    expect(slot?.toISOString()).toBe("2026-07-19T09:00:00.000Z");
  });

  it("walks back to the most recent prior scheduled day when today isn't one and/or today's slot hasn't happened yet", () => {
    // 2026-07-19 is a Sunday; schedule is Friday only; most recent Friday before this Sunday is 2026-07-17
    const now = new Date("2026-07-19T12:00:00.000Z");
    const slot = mostRecentExpectedSlot(["fri"], "09:00", now);
    expect(slot?.toISOString()).toBe("2026-07-17T09:00:00.000Z");
  });

  it("does not return a slot later than now on a scheduled day", () => {
    // 2026-07-19 is a Sunday, scheduled for 09:00, but now is 08:00 same day — today's slot hasn't happened yet
    const now = new Date("2026-07-19T08:00:00.000Z");
    const slot = mostRecentExpectedSlot(["sun"], "09:00", now);
    expect(slot?.toISOString()).toBe("2026-07-12T09:00:00.000Z"); // the previous Sunday
  });
});

const testDbPath = "data/test-scheduler-catchup.db";

describe("checkMissedRun", () => {
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

  it("does nothing when no schedule is configured", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [], scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun");

    await checkMissedRun();

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("fires a catchup run when the most recent slot is unmatched and within 24h", async () => {
    const now = new Date();
    const recentSlot = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2h ago
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][recentSlot.getUTCDay()];
    const hh = String(recentSlot.getUTCHours()).padStart(2, "0");
    const mm = String(recentSlot.getUTCMinutes()).padStart(2, "0");

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [dayName], scheduleTime: `${hh}:${mm}`,
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun").mockResolvedValue(undefined);

    await checkMissedRun();

    expect(triggerSpy).toHaveBeenCalledWith("catchup");
  });

  it("does not fire when a matching scheduled/catchup run already exists at or after the expected slot", async () => {
    const now = new Date();
    const recentSlot = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][recentSlot.getUTCDay()];
    const hh = String(recentSlot.getUTCHours()).padStart(2, "0");
    const mm = String(recentSlot.getUTCMinutes()).padStart(2, "0");

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [dayName], scheduleTime: `${hh}:${mm}`,
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const db = getDb();
    await db.insert(pipelineRunsTable).values({ startedAt: recentSlot, type: "scheduled", status: "success" });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun").mockResolvedValue(undefined);

    await checkMissedRun();

    expect(triggerSpy).not.toHaveBeenCalled();
  });

  it("does not fire when the most recent slot is older than 24h", async () => {
    const oldSlot = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30h ago
    const dayName = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][oldSlot.getUTCDay()];
    const hh = String(oldSlot.getUTCHours()).padStart(2, "0");
    const mm = String(oldSlot.getUTCMinutes()).padStart(2, "0");

    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionRuns: null, candidateRetentionDays: null,
      scheduleDays: [dayName], scheduleTime: `${hh}:${mm}`,
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null,
    });
    const triggerSpy = vi.spyOn(triggerModule, "triggerRun");

    await checkMissedRun();

    expect(triggerSpy).not.toHaveBeenCalled();
  });
});
