/**
 * Tests for saveModelCheckSettings — the Settings page's model-checking
 * controls (the on/off switch and the three time limits).
 *
 * Two things worth pinning: the four values save together as one decision,
 * and saving them leaves the rest of the settings object untouched. The
 * second matters because this action writes the whole file, so a bug here
 * would silently wipe someone's schedule or voice profile.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { saveModelCheckSettings } from "./actions";
import { getSettings, saveSettings } from "../../../lib/config/settings";

const testConfigDir = "data/test-config-model-check";

describe("saveModelCheckSettings", () => {
  beforeEach(() => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
  });

  it("writes all four values together", async () => {
    const result = await saveModelCheckSettings({
      modelHealthCheckEnabled: false,
      healthCheckTimeoutMs: 15_000,
      probeTimeoutMs: 45_000,
      llmCallTimeoutMs: 90_000,
    });

    expect(result.ok).toBe(true);
    const settings = await getSettings();
    expect(settings.modelHealthCheckEnabled).toBe(false);
    expect(settings.healthCheckTimeoutMs).toBe(15_000);
    expect(settings.probeTimeoutMs).toBe(45_000);
    expect(settings.llmCallTimeoutMs).toBe(90_000);
  });

  it("leaves every unrelated setting alone", async () => {
    const before = await getSettings();
    await saveSettings({ ...before, scheduleDays: ["mon", "thu"], scheduleTime: "07:30", curationTopN: 9 });

    await saveModelCheckSettings({
      modelHealthCheckEnabled: false,
      healthCheckTimeoutMs: 10_000,
      probeTimeoutMs: 20_000,
      llmCallTimeoutMs: 30_000,
    });

    const after = await getSettings();
    expect(after.scheduleDays).toEqual(["mon", "thu"]);
    expect(after.scheduleTime).toBe("07:30");
    expect(after.curationTopN).toBe(9);
  });
});
