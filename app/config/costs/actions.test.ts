/**
 * Tests for the Costs page Server Action (`saveBudgetCap`).
 *
 * Uses the same isolated-config-dir pattern as other `app/config` actions
 * tests: a dedicated `SIFT_CONFIG_DIR` per test, cleaned up afterward.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { saveBudgetCap } from "./actions";
import { getSettings } from "../../../lib/config/settings";
import * as settingsModule from "../../../lib/config/settings";

const testConfigDir = "data/test-config-costs-actions";

describe("saveBudgetCap", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    vi.restoreAllMocks();
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("writes budgetCapUsd", async () => {
    const result = await saveBudgetCap(25);
    expect(result.ok).toBe(true);
    const settings = await getSettings();
    expect(settings.budgetCapUsd).toBe(25);
  });

  it("accepts null for unlimited", async () => {
    await saveBudgetCap(25);
    await saveBudgetCap(null);
    const settings = await getSettings();
    expect(settings.budgetCapUsd).toBeNull();
  });

  it("returns {ok: false, error} instead of throwing when the write fails", async () => {
    vi.spyOn(settingsModule, "saveSettings").mockRejectedValue(new Error("disk full"));

    const result = await saveBudgetCap(25);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("disk full");
  });
});
