/**
 * Tests for lib/health/model-health.ts — the per-process health singleton.
 *
 * Two of these are structural safety nets rather than feature tests, and both
 * exist because of a real bug fixed on 2026-08-27 (see
 * ~/.claude/issues/013): work started from Next.js's instrumentation hook
 * must never be awaitable and must never be able to kill the process.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { startModelHealthCheck, getModelHealth, invalidateModelHealth, __resetForTests } from "./model-health";
import type { HealthDeps } from "./model-health";
import type { HealthCheckResult, ModelVerdict } from "./types";
import type { Settings } from "../config/types";

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

function resultWith(...verdicts: ModelVerdict[]): HealthCheckResult {
  return {
    overall: "ok",
    stages: verdicts.map((verdict, i) => ({
      stage: i === 0 ? ("curation" as const) : ("drafting" as const),
      providerLabel: "P",
      model: "m",
      verdict,
      detail: "d",
    })),
    usage: [],
  };
}

function deps(over: Partial<HealthDeps> = {}, settings: Partial<Settings> = {}): HealthDeps {
  return {
    getSettings: async () => ({ ...SETTINGS, ...settings }),
    check: async () => resultWith("ok", "ok"),
    ...over,
  };
}

/** Lets pending microtasks and the check's own promise chain settle. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("model health singleton", () => {
  beforeEach(() => {
    __resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetForTests();
  });

  it("starts out unknown, so nothing is gated before a check has ever run", () => {
    expect(getModelHealth()).toEqual({ phase: "unknown" });
  });

  it("returns undefined synchronously — there is no promise a caller could await", () => {
    // The structural guarantee. instrumentation.ts's register() is awaited by
    // Next.js before it serves any request, so a Promise-returning start
    // function is one stray `await` away from hanging the whole server.
    const returned = startModelHealthCheck(deps({ check: () => new Promise(() => {}) }));
    expect(returned).toBeUndefined();
  });

  it("is in the checking phase while the check is in flight", async () => {
    startModelHealthCheck(deps({ check: () => new Promise(() => {}) }));
    await flush();
    expect(getModelHealth().phase).toBe("checking");
  });

  it("settles with the stages the check produced", async () => {
    startModelHealthCheck(deps({ check: async () => resultWith("ok", "timeout") }));
    await flush();

    const state = getModelHealth();
    expect(state.phase).toBe("settled");
    if (state.phase !== "settled") throw new Error("unreachable");
    expect(state.stages.map((s) => s.verdict)).toEqual(["ok", "timeout"]);
  });

  it("runs the check only once when started twice while still in flight", async () => {
    const check = vi.fn(() => new Promise<HealthCheckResult>(() => {}));
    const d = deps({ check });

    startModelHealthCheck(d);
    startModelHealthCheck(d);
    await flush();

    expect(check).toHaveBeenCalledTimes(1);
  });

  it("settles to inconclusive without an unhandled rejection when the check throws", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      startModelHealthCheck(deps({ check: async () => { throw new Error("boom"); } }));
      await flush();
      await flush();

      const state = getModelHealth();
      expect(state.phase).toBe("settled");
      if (state.phase !== "settled") throw new Error("unreachable");
      expect(state.overall).toBe("inconclusive");
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("stays unknown and never probes when the feature is switched off", async () => {
    const check = vi.fn();
    startModelHealthCheck(deps({ check }, { modelHealthCheckEnabled: false }));
    await flush();

    expect(check).not.toHaveBeenCalled();
    expect(getModelHealth()).toEqual({ phase: "unknown" });
  });

  it("returns to unknown on invalidate, and can then be started again", async () => {
    const check = vi.fn(async () => resultWith("ok", "ok"));
    startModelHealthCheck(deps({ check }));
    await flush();
    expect(getModelHealth().phase).toBe("settled");

    invalidateModelHealth();
    expect(getModelHealth()).toEqual({ phase: "unknown" });

    startModelHealthCheck(deps({ check }));
    await flush();
    expect(check).toHaveBeenCalledTimes(2);
    expect(getModelHealth().phase).toBe("settled");
  });
});
