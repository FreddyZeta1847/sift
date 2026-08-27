/**
 * Tests for the health status Server Action.
 *
 * Small surface, but one of these guards something easy to break by
 * accident: whatever this returns crosses the server/client boundary, so it
 * has to survive serialization. A Date added to HealthState would sail
 * through TypeScript and fail only at runtime, in the browser.
 */
import { describe, it, expect, afterEach } from "vitest";
import { getModelHealthStatus } from "./actions";
import { startModelHealthCheck, __resetForTests } from "../../lib/health/model-health";
import type { HealthCheckResult } from "../../lib/health/types";
import type { Settings } from "../../lib/config/types";

const SETTINGS: Settings = {
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

const RESULT: HealthCheckResult = {
  overall: "problems",
  stages: [
    { stage: "curation", providerLabel: "OpenAI", model: "m", verdict: "ok", detail: "fine" },
    { stage: "drafting", providerLabel: "Google", model: "g", verdict: "timeout", detail: "no answer" },
  ],
  usage: [],
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("getModelHealthStatus", () => {
  afterEach(() => {
    __resetForTests();
  });

  it("reports unknown before any check has run", async () => {
    expect(await getModelHealthStatus()).toEqual({ phase: "unknown" });
  });

  it("hands back whatever the singleton currently holds", async () => {
    startModelHealthCheck({ getSettings: async () => SETTINGS, check: async () => RESULT });
    await flush();

    const state = await getModelHealthStatus();
    expect(state.phase).toBe("settled");
    if (state.phase !== "settled") throw new Error("unreachable");
    expect(state.overall).toBe("problems");
    expect(state.stages[1].verdict).toBe("timeout");
  });

  it("returns something that survives the trip to the browser", async () => {
    startModelHealthCheck({ getSettings: async () => SETTINGS, check: async () => RESULT });
    await flush();

    const state = await getModelHealthStatus();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
