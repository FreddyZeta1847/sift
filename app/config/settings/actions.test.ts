/**
 * Tests for the Settings page (`/config/settings`) Server Actions.
 *
 * Covers source toggling/adding, schedule persistence and live cron
 * re-registration (see actions.ts header), Run Now (including the
 * run-guard no-op path), voice profile persistence, and retention
 * persistence. Each test points `SIFT_CONFIG_DIR` at an isolated scratch
 * directory so it never touches the real `config/` files.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { toggleSource, addSource, saveSchedule, runNow, saveVoiceProfile, saveRetention, saveCurationTopN } from "./actions";
import { getSources } from "../../../lib/config/sources";
import { getSettings } from "../../../lib/config/settings";
import * as settingsModule from "../../../lib/config/settings";
import * as runPipelineModule from "../../../scripts/run-pipeline";
import * as runGuardModule from "../../../lib/pipeline/run-guard";
import * as cronModule from "../../../lib/scheduler/cron";

const testConfigDir = "data/test-config-settings-actions";

describe("settings page actions", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
    runGuardModule.clearRunning();
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    vi.restoreAllMocks();
    runGuardModule.clearRunning();
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("toggleSource flips enabled for the named source", async () => {
    const sources = await getSources();
    const target = sources[0];
    await toggleSource(target.name);
    const updated = await getSources();
    expect(updated.find((s) => s.name === target.name)!.enabled).toBe(!target.enabled);
  });

  it("addSource appends a new enabled source", async () => {
    await addSource({ name: "New Source", url: "https://new.test/feed", category: "ai-ml" });
    const sources = await getSources();
    expect(sources.some((s) => s.name === "New Source" && s.enabled)).toBe(true);
  });

  it("saveSchedule persists scheduleDays and scheduleTime", async () => {
    const result = await saveSchedule(["mon", "wed"], "14:30");
    expect(result.ok).toBe(true);
    const settings = await getSettings();
    expect(settings.scheduleDays).toEqual(["mon", "wed"]);
    expect(settings.scheduleTime).toBe("14:30");
  });

  it("saveSchedule returns {ok: false, error} instead of throwing when the write fails", async () => {
    vi.spyOn(settingsModule, "saveSettings").mockRejectedValue(new Error("disk full"));

    const result = await saveSchedule(["mon", "wed"], "14:30");

    expect(result.ok).toBe(false);
    expect(result.error).toBe("disk full");
  });

  it("runNow invokes runPipeline with type manual", async () => {
    const pipelineSpy = vi.spyOn(runPipelineModule, "runPipeline").mockResolvedValue({ status: "success" });
    const result = await runNow();
    expect(result.ok).toBe(true);
    expect(pipelineSpy).toHaveBeenCalledWith("manual");
  });

  it("runNow is a silent no-op if a run is already in progress", async () => {
    runGuardModule.checkAndSetRunning();
    const pipelineSpy = vi.spyOn(runPipelineModule, "runPipeline");
    const result = await runNow();
    expect(result.ok).toBe(false);
    expect(pipelineSpy).not.toHaveBeenCalled();
  });

  it("saveVoiceProfile writes the given profile", async () => {
    const profile = { toneNotes: "direct", examplePosts: ["a post"], interests: ["ai"] };
    await saveVoiceProfile(profile);
    const settings = await getSettings();
    expect(settings.voiceProfile).toEqual(profile);
  });

  it("saveRetention writes postsRetentionRuns and candidateRetentionDays", async () => {
    await saveRetention(10, 7);
    const settings = await getSettings();
    expect(settings.postsRetentionRuns).toBe(10);
    expect(settings.candidateRetentionDays).toBe(7);
  });

  it("saveCurationTopN writes curationTopN", async () => {
    await saveCurationTopN(7);
    const settings = await getSettings();
    expect(settings.curationTopN).toBe(7);
  });

  it("saveSchedule re-registers the cron job live after a successful save", async () => {
    const registerSpy = vi.spyOn(cronModule, "registerCronJob").mockImplementation(() => {});

    await saveSchedule(["tue"], "11:00");

    expect(registerSpy).toHaveBeenCalledWith(["tue"], "11:00", expect.any(Function));
  });

  it("saveSchedule surfaces a re-registration failure without losing the persisted save", async () => {
    vi.spyOn(cronModule, "registerCronJob").mockImplementation(() => {
      throw new Error("bad expression");
    });

    const result = await saveSchedule(["wed"], "12:00");

    expect(result.ok).toBe(false);
    expect(result.error).toContain("bad expression");
    const settings = await getSettings();
    expect(settings.scheduleDays).toEqual(["wed"]); // the save itself still happened
  });
});
