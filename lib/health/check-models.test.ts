/**
 * Tests for lib/health/check-models.ts.
 *
 * Fully dependency-injected, so none of these touch the network, the disk or
 * the database. The load-bearing assertions are the ones proving "timeout"
 * and "inconclusive" never collapse into each other, and that a model
 * assigned to both stages is only paid for once.
 */
import { describe, it, expect, vi } from "vitest";
import { checkAssignedModels } from "./check-models";
import type { CheckDeps } from "./check-models";
import type { ProbeOutcome, ProbeResult } from "../config/test-model-probe";
import type { Provider, Settings } from "../config/types";

const BASE_SETTINGS: Settings = {
  budgetCapUsd: null,
  postsRetentionDays: null,
  candidateRetentionDays: null,
  scheduleDays: [],
  scheduleTime: "09:00",
  voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
  curationProviderId: null,
  curationModel: null,
  draftingProviderId: null,
  draftingModel: null,
  curationTopN: 3,
  modelHealthCheckEnabled: true,
  healthCheckTimeoutMs: 30_000,
  probeTimeoutMs: 60_000,
  llmCallTimeoutMs: 180_000,
};

const openai: Provider = { id: "openai", label: "OpenAI", baseUrl: "https://o.test", apiKey: "k", kind: "openai-compatible" };
const google: Provider = { id: "google", label: "Google", baseUrl: "https://g.test", apiKey: "k", kind: "openai-compatible" };

function outcome(result: ProbeResult): ProbeOutcome {
  return { result, inputTokens: 4, outputTokens: 6 };
}

function deps(settings: Partial<Settings>, probe: CheckDeps["probe"], providers: Provider[] = [openai, google]): CheckDeps {
  return {
    getSettings: async () => ({ ...BASE_SETTINGS, ...settings }),
    getProviders: async () => providers,
    probe,
  };
}

const bothStagesOnOpenai = {
  curationProviderId: "openai",
  curationModel: "m-cur",
  draftingProviderId: "openai",
  draftingModel: "m-draft",
};

describe("checkAssignedModels", () => {
  it("reports unconfigured for both stages without making a single call", async () => {
    const probe = vi.fn();
    const result = await checkAssignedModels(deps({}, probe));

    expect(probe).not.toHaveBeenCalled();
    expect(result.stages.map((s) => s.verdict)).toEqual(["unconfigured", "unconfigured"]);
    expect(result.overall).toBe("unconfigured");
  });

  it("probes only the configured stage when just one is assigned", async () => {
    const probe = vi.fn().mockResolvedValue(outcome("pass"));
    const result = await checkAssignedModels(
      deps({ curationProviderId: "openai", curationModel: "m-cur" }, probe)
    );

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.stages[0]).toMatchObject({ stage: "curation", verdict: "ok" });
    expect(result.stages[1]).toMatchObject({ stage: "drafting", verdict: "unconfigured" });
  });

  it("probes a provider+model pair shared by both stages exactly once", async () => {
    const probe = vi.fn().mockResolvedValue(outcome("pass"));
    const result = await checkAssignedModels(
      deps(
        { curationProviderId: "openai", curationModel: "same", draftingProviderId: "openai", draftingModel: "same" },
        probe
      )
    );

    expect(probe).toHaveBeenCalledTimes(1);
    expect(result.stages.map((s) => s.verdict)).toEqual(["ok", "ok"]);
    expect(result.usage).toHaveLength(1);
  });

  it("probes twice when the two stages use different pairs", async () => {
    const probe = vi.fn().mockResolvedValue(outcome("pass"));
    await checkAssignedModels(
      deps(
        { curationProviderId: "openai", curationModel: "a", draftingProviderId: "google", draftingModel: "b" },
        probe
      )
    );

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("passes the user's configured check budget to the probe", async () => {
    const probe = vi.fn().mockResolvedValue(outcome("pass"));
    await checkAssignedModels(
      deps({ ...bothStagesOnOpenai, healthCheckTimeoutMs: 7_000 }, probe)
    );

    expect(probe).toHaveBeenCalledWith(openai, "m-cur", 7_000);
  });

  it.each<[ProbeResult, string]>([
    ["pass", "ok"],
    ["fail", "broken"],
    ["unreachable", "broken"],
    ["timeout", "timeout"],
    ["inconclusive", "inconclusive"],
  ])("maps probe result %s to verdict %s", async (probeResult, verdict) => {
    const probe = vi.fn().mockResolvedValue(outcome(probeResult));
    const result = await checkAssignedModels(deps(bothStagesOnOpenai, probe));

    expect(result.stages[0].verdict).toBe(verdict);
  });

  it("keeps timeout and inconclusive apart when the two stages differ", async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce(outcome("timeout"))
      .mockResolvedValueOnce(outcome("inconclusive"));
    const result = await checkAssignedModels(
      deps(
        { curationProviderId: "openai", curationModel: "a", draftingProviderId: "google", draftingModel: "b" },
        probe
      )
    );

    expect(result.stages[0].verdict).toBe("timeout");
    expect(result.stages[1].verdict).toBe("inconclusive");
    // A real failure outranks a "we don't know" in the roll-up.
    expect(result.overall).toBe("problems");
  });

  it("reports broken without probing when the assigned provider no longer exists", async () => {
    const probe = vi.fn();
    const result = await checkAssignedModels(
      deps({ curationProviderId: "deleted", curationModel: "m" }, probe)
    );

    expect(probe).not.toHaveBeenCalled();
    expect(result.stages[0].verdict).toBe("broken");
    expect(result.stages[0].detail).toMatch(/deleted/);
  });

  it("treats a thrown probe as inconclusive and never rejects", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("boom"));
    const result = await checkAssignedModels(deps(bothStagesOnOpenai, probe));

    expect(result.stages[0].verdict).toBe("inconclusive");
    expect(result.overall).toBe("inconclusive");
  });

  it("rolls up to inconclusive only when nothing is actually broken", async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce(outcome("pass"))
      .mockResolvedValueOnce(outcome("inconclusive"));
    const result = await checkAssignedModels(
      deps(
        { curationProviderId: "openai", curationModel: "a", draftingProviderId: "google", draftingModel: "b" },
        probe
      )
    );

    expect(result.overall).toBe("inconclusive");
  });

  it("reports what the check spent, per distinct pair", async () => {
    const probe = vi.fn().mockResolvedValue({ result: "pass", inputTokens: 9, outputTokens: 3 });
    const result = await checkAssignedModels(deps(bothStagesOnOpenai, probe));

    expect(result.usage).toEqual([
      { providerId: "openai", model: "m-cur", inputTokens: 9, outputTokens: 3 },
      { providerId: "openai", model: "m-draft", inputTokens: 9, outputTokens: 3 },
    ]);
  });
});
