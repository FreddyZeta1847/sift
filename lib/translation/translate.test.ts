/**
 * Tests for lib/translation/translate.ts — the main-thread entry point.
 * Mocks node:worker_threads's Worker class itself (never spawns a real
 * thread, never touches worker.ts or @huggingface/transformers) so these
 * tests exercise translate()'s own contract: request/response wiring,
 * the pt pre-flight guard, worker reuse across calls, and crash/respawn
 * handling — matching TRANSLATION--resilience.md's "a crash during
 * inference is contained to that worker" and TRANSLATION--caching.md's
 * "stays loaded for the life of the running process".
 *
 * translate.ts is re-imported fresh (vi.resetModules) per test so its
 * module-scope singleton worker doesn't leak across cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";

class MockWorker extends EventEmitter {
  postMessage = vi.fn();
  terminate = vi.fn();
}
const mockInstances: MockWorker[] = [];

vi.mock("node:worker_threads", () => ({
  Worker: vi.fn().mockImplementation(() => {
    const instance = new MockWorker();
    mockInstances.push(instance);
    return instance;
  }),
}));

async function freshTranslateModule() {
  vi.resetModules();
  return import("./translate");
}

describe("translate()", () => {
  beforeEach(() => {
    mockInstances.length = 0;
  });

  it("resolves with the translated text once the worker posts back a success response", async () => {
    const { translate } = await freshTranslateModule();

    const result = translate("Hello world", "es");
    expect(mockInstances).toHaveLength(1);
    const worker = mockInstances[0];
    expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, text: "Hello world", language: "es" });

    worker.emit("message", { id: 1, ok: true, text: "Hola mundo" });

    await expect(result).resolves.toBe("Hola mundo");
  });

  it("rejects with a TranslationError on a mocked worker failure response, and this module never touches the database", async () => {
    const { translate, TranslationError } = await freshTranslateModule();

    const result = translate("Hello", "fr");
    const worker = mockInstances[0];
    worker.emit("message", { id: 1, ok: false, message: "model download failed" });

    await expect(result).rejects.toBeInstanceOf(TranslationError);
    await expect(result).rejects.toThrow(/model download failed/);

    // Documents, rather than merely asserts, TRANSLATION--resilience.md's
    // "no post_translations row on a failed attempt": this module has no
    // DB import to write one with in the first place. A caller (the
    // not-yet-built Server Action) is solely responsible for the write,
    // and only after translate() resolves.
    const source = readFileSync(new URL("./translate.ts", import.meta.url), "utf-8");
    expect(source).not.toMatch(/from ["'].*\/db\/|drizzle-orm/);
  });

  it("rejects immediately for an unavailable language (pt) without spawning a worker", async () => {
    const { translate, TranslationUnavailableError } = await freshTranslateModule();

    await expect(translate("Hello", "pt")).rejects.toBeInstanceOf(TranslationUnavailableError);
    expect(mockInstances).toHaveLength(0);
  });

  it("reuses a single worker across multiple translate() calls instead of spawning one per call", async () => {
    const { translate } = await freshTranslateModule();

    const first = translate("A", "es");
    mockInstances[0].emit("message", { id: 1, ok: true, text: "A-es" });
    await first;

    const second = translate("B", "de");
    mockInstances[0].emit("message", { id: 2, ok: true, text: "B-de" });
    await second;

    expect(mockInstances).toHaveLength(1);
  });

  it("rejects the in-flight request on a worker crash, and respawns a fresh worker for the next call", async () => {
    const { translate, TranslationError } = await freshTranslateModule();

    const first = translate("A", "es");
    mockInstances[0].emit("error", new Error("native ONNX crash"));
    await expect(first).rejects.toBeInstanceOf(TranslationError);

    const second = translate("B", "es");
    expect(mockInstances).toHaveLength(2); // crashed worker discarded, a fresh one spawned
    mockInstances[1].emit("message", { id: 2, ok: true, text: "B-es" });
    await expect(second).resolves.toBe("B-es");
  });
});
