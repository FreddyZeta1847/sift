import { describe, it, expect, vi, afterEach } from "vitest";
import { initializeScheduler, __resetForTests } from "./init";
import * as settingsModule from "../config/settings";
import * as cronModule from "./cron";
import * as catchupModule from "./catchup";

describe("initializeScheduler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    __resetForTests();
  });

  it("registers the cron job from current settings and runs the missed-run check", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null,
      scheduleDays: ["mon"], scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null, curationTopN: 3,
    });
    const registerSpy = vi.spyOn(cronModule, "registerCronJob").mockImplementation(() => {});
    const catchupSpy = vi.spyOn(catchupModule, "checkMissedRun").mockResolvedValue(undefined);

    await initializeScheduler();

    expect(registerSpy).toHaveBeenCalledWith(["mon"], "09:00", expect.any(Function));
    expect(catchupSpy).toHaveBeenCalled();
  });

  it("only initializes once even if called multiple times", async () => {
    vi.spyOn(settingsModule, "getSettings").mockResolvedValue({
      budgetCapUsd: null, postsRetentionDays: null, candidateRetentionDays: null,
      scheduleDays: [], scheduleTime: "09:00",
      voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
      curationProviderId: null, curationModel: null, draftingProviderId: null, draftingModel: null, curationTopN: 3,
    });
    const catchupSpy = vi.spyOn(catchupModule, "checkMissedRun").mockResolvedValue(undefined);

    await initializeScheduler();
    await initializeScheduler();

    expect(catchupSpy).toHaveBeenCalledTimes(1);
  });
});
