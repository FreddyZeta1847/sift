/**
 * Tests for the API Config page's server actions (add/update/delete provider,
 * assign models, probe a model). Each test resets config/providers.json to an
 * explicit empty list before running, since getProviders() now seeds every
 * known provider by default on a fresh-install file (lib/config/providers.ts)
 * — these tests care about CRUD behavior in isolation, not that seed.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { addProvider, updateProvider, deleteProvider, assignModels, probeModelAction } from "./actions";
import { getProviders, saveProviders } from "../../../lib/config/providers";
import * as providersModule from "../../../lib/config/providers";
import { getSettings } from "../../../lib/config/settings";
import * as probeModule from "../../../lib/config/test-model-probe";

const testConfigDir = "data/test-config-api-actions";

describe("api config actions", () => {
  beforeEach(async () => {
    process.env.SIFT_CONFIG_DIR = testConfigDir;
    // getProviders() now seeds every known provider as the default when
    // providers.json doesn't exist yet (a fresh install — see
    // lib/config/providers.ts). These tests care about CRUD behavior in
    // isolation, not the seeding default, so start from a real, empty file.
    await saveProviders([]);
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

  it("probeModelAction looks up the provider by id and delegates to probeModel", async () => {
    const provider = { id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" as const };
    await saveProviders([provider]);
    const spy = vi.spyOn(probeModule, "probeModel").mockResolvedValue("pass");

    const result = await probeModelAction("p1", "m1");

    expect(result).toBe("pass");
    expect(spy).toHaveBeenCalledWith(provider, "m1");
  });

  it("probeModelAction returns unreachable when the provider id doesn't exist", async () => {
    const result = await probeModelAction("missing", "m1");
    expect(result).toBe("unreachable");
  });
});
