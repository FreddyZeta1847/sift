/**
 * Tests for the API Config page's server actions (add/update/delete provider,
 * assign models, probe a model). Each test resets config/providers.json to an
 * explicit empty list before running, since getProviders() now seeds every
 * known provider by default on a fresh-install file (lib/config/providers.ts)
 * — these tests care about CRUD behavior in isolation, not that seed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import {
  addProvider,
  updateProvider,
  deleteProvider,
  assignModels,
  probeModelAction,
  addModel,
  updateModelPrices,
  deleteModel,
} from "./actions";
import { getModels, saveModels } from "../../../lib/config/models";
import { getProviders, saveProviders } from "../../../lib/config/providers";
import * as providersModule from "../../../lib/config/providers";
import { getSettings } from "../../../lib/config/settings";
import * as settingsModule from "../../../lib/config/settings";
import * as probeModule from "../../../lib/config/test-model-probe";
import * as modelHealthModule from "../../../lib/health/model-health";
import * as nonPipelineModule from "../../../lib/llm/non-pipeline-calls";

const testConfigDir = "data/test-config-api-actions";

describe("api config actions", () => {
  beforeEach(async () => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
    // getProviders() now seeds every known provider as the default when
    // providers.json doesn't exist yet (a fresh install — see
    // lib/config/providers.ts). These tests care about CRUD behavior in
    // isolation, not the seeding default, so start from a real, empty file.
    await saveProviders([]);
    // assignModels re-runs the model health check on success. Stubbed here so
    // no test in this file can reach a real provider over the network.
    vi.spyOn(modelHealthModule, "startModelHealthCheck").mockImplementation(() => {});
    vi.spyOn(modelHealthModule, "invalidateModelHealth").mockImplementation(() => {});
    // Same reasoning as saveProviders([]) above: getModels() seeds a handful
    // of known models on a fresh file, and these tests are about registry
    // behaviour, not the seed.
    await saveModels([]);
    // A probe now records what it spent. These tests have no database, and
    // the recording is best-effort anyway, so stub it out.
    vi.spyOn(nonPipelineModule, "tryLogNonPipelineCall").mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.SIFT_CONFIG_DIR;
    if (existsSync(testConfigDir)) rmSync(testConfigDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("addProvider appends a new provider", async () => {
    const result = await addProvider({ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" });
    expect(result.ok).toBe(true);
    expect(await getProviders()).toHaveLength(1);
  });

  it("addProvider rejects a duplicate id", async () => {
    await addProvider({ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" });
    const result = await addProvider({ id: "p1", label: "Dup", baseUrl: "http://y", apiKey: "k2", kind: "openai-compatible" });
    expect(result.ok).toBe(false);
  });

  it("addProvider returns {ok: false, error} instead of throwing when the write fails", async () => {
    vi.spyOn(providersModule, "saveProviders").mockRejectedValue(new Error("disk full"));

    const result = await addProvider({ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" });

    expect(result.ok).toBe(false);
    expect(result.error).toBe("disk full");
  });

  it("updateProvider replaces the matching entry", async () => {
    await addProvider({ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" });
    await updateProvider({ id: "p1", label: "Updated", baseUrl: "http://x", apiKey: "k2", kind: "openai-compatible" });
    const providers = await getProviders();
    expect(providers[0].label).toBe("Updated");
  });

  it("deleteProvider removes an unassigned provider", async () => {
    await addProvider({ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" });
    const result = await deleteProvider("p1");
    expect(result.ok).toBe(true);
    expect(await getProviders()).toHaveLength(0);
  });

  it("deleteProvider refuses when the provider is assigned to a pipeline stage", async () => {
    await addProvider({ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" });
    await assignModels({ curationProviderId: "p1", curationModel: "m", draftingProviderId: "p1", draftingModel: "m" });

    const result = await deleteProvider("p1");

    expect(result.ok).toBe(false);
    expect(await getProviders()).toHaveLength(1);
  });

  it("assignModels writes the four settings fields", async () => {
    await assignModels({ curationProviderId: "p1", curationModel: "m1", draftingProviderId: "p2", draftingModel: "m2" });
    const settings = await getSettings();
    expect(settings.curationProviderId).toBe("p1");
    expect(settings.curationModel).toBe("m1");
    expect(settings.draftingProviderId).toBe("p2");
    expect(settings.draftingModel).toBe("m2");
  });

  it("assignModels re-runs the model health check once the new pair is saved", async () => {
    await assignModels({ curationProviderId: "p1", curationModel: "m1", draftingProviderId: "p2", draftingModel: "m2" });

    expect(modelHealthModule.invalidateModelHealth).toHaveBeenCalled();
    expect(modelHealthModule.startModelHealthCheck).toHaveBeenCalled();
  });

  it("assignModels leaves the existing health verdict alone when the write fails", async () => {
    // A failed save means the OLD assignment is still in force, so the old
    // verdict is still the truth — discarding it would be wrong.
    vi.spyOn(settingsModule, "saveSettings").mockRejectedValue(new Error("disk full"));

    const result = await assignModels({
      curationProviderId: "p1",
      curationModel: "m1",
      draftingProviderId: "p2",
      draftingModel: "m2",
    });

    expect(result.ok).toBe(false);
    expect(modelHealthModule.invalidateModelHealth).not.toHaveBeenCalled();
    expect(modelHealthModule.startModelHealthCheck).not.toHaveBeenCalled();
  });

  it("probeModelAction looks up the provider by id and delegates to probeModel with the user's budget", async () => {
    const provider = { id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" as const };
    await saveProviders([provider]);
    const spy = vi
      .spyOn(probeModule, "probeModelWithUsage")
      .mockResolvedValue({ result: "pass", inputTokens: 12, outputTokens: 4 });

    const result = await probeModelAction("p1", "m1");

    expect(result).toBe("pass");
    // Third argument added deliberately: how long to wait for a model is a
    // user setting now, not a constant chosen inside the probe.
    const settings = await getSettings();
    expect(spy).toHaveBeenCalledWith(provider, "m1", settings.probeTimeoutMs);
  });

  it("probeModelAction records what the probe spent", async () => {
    // Test-button calls used to cost real money and leave no trace anywhere.
    const provider = { id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" as const };
    await saveProviders([provider]);
    vi.spyOn(probeModule, "probeModelWithUsage").mockResolvedValue({
      result: "pass",
      inputTokens: 12,
      outputTokens: 4,
    });

    await probeModelAction("p1", "m1");

    expect(nonPipelineModule.tryLogNonPipelineCall).toHaveBeenCalledWith({
      origin: "probe",
      provider: "p1",
      model: "m1",
      inputTokens: 12,
      outputTokens: 4,
    });
  });

  it("probeModelAction records nothing when no tokens were spent", async () => {
    const provider = { id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" as const };
    await saveProviders([provider]);
    vi.spyOn(probeModule, "probeModelWithUsage").mockResolvedValue({
      result: "inconclusive",
      inputTokens: 0,
      outputTokens: 0,
    });

    await probeModelAction("p1", "m1");

    expect(nonPipelineModule.tryLogNonPipelineCall).not.toHaveBeenCalled();
  });

  it("probeModelAction returns unreachable when the provider id doesn't exist", async () => {
    const result = await probeModelAction("missing", "m1");
    expect(result).toBe("unreachable");
  });

  describe("model registry", () => {
    const gemini = { providerId: "google-gemini", model: "gemini-3-flash-preview", inputPer1M: 0.3, outputPer1M: 2.5 };

    it("addModel appends a new provider+model row", async () => {
      const result = await addModel(gemini);
      expect(result.ok).toBe(true);
      expect(await getModels()).toEqual([gemini]);
    });

    it("addModel rejects the same model twice for one provider", async () => {
      await addModel(gemini);
      const result = await addModel({ ...gemini, inputPer1M: 99 });

      expect(result.ok).toBe(false);
      expect(await getModels()).toHaveLength(1);
    });

    it("addModel allows the same model name under a different provider", async () => {
      // The pair is the key precisely because one model can be resold at
      // different prices — or served free from a local box.
      await addModel(gemini);
      const result = await addModel({ ...gemini, providerId: "openrouter", inputPer1M: 0.4 });

      expect(result.ok).toBe(true);
      expect(await getModels()).toHaveLength(2);
    });

    it("updateModelPrices changes only the prices, leaving the pair alone", async () => {
      await addModel(gemini);
      const result = await updateModelPrices(gemini.providerId, gemini.model, 1.5, 7.5);

      expect(result.ok).toBe(true);
      expect(await getModels()).toEqual([{ ...gemini, inputPer1M: 1.5, outputPer1M: 7.5 }]);
    });

    it("updateModelPrices reports a pair that is not listed", async () => {
      const result = await updateModelPrices("nobody", "nothing", 1, 1);
      expect(result.ok).toBe(false);
    });

    it("deleteModel removes an unassigned row", async () => {
      await addModel(gemini);
      const result = await deleteModel(gemini.providerId, gemini.model);

      expect(result.ok).toBe(true);
      expect(await getModels()).toEqual([]);
    });

    it("deleteModel refuses to remove a model a pipeline stage is using", async () => {
      // Otherwise the stage keeps an assignment the dropdown can no longer
      // offer, and the next run fails with no obvious cause.
      await addModel(gemini);
      await assignModels({
        curationProviderId: gemini.providerId,
        curationModel: gemini.model,
        draftingProviderId: "other",
        draftingModel: "other-model",
      });

      const result = await deleteModel(gemini.providerId, gemini.model);

      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/assigned/);
      expect(await getModels()).toHaveLength(1);
    });
  });
});
