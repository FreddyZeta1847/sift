/**
 * Tests for lib/translation/worker.ts's handleRequest — the logic that
 * runs inside the worker_thread once it's actually spawned. Mocks
 * @huggingface/transformers's pipeline() directly (never downloads a
 * model or runs real inference) and imports worker.ts's own exports
 * rather than going through a real worker_thread — the actual
 * worker_thread boundary (spawn, message passing, path resolution) is
 * covered separately by translate.test.ts, which mocks node:worker_threads
 * itself instead.
 *
 * worker.ts is re-imported fresh (vi.resetModules) in each test so its
 * module-scope pipeline cache doesn't leak state across cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const pipelineMock = vi.fn();

vi.mock("@huggingface/transformers", () => ({
  pipeline: (...args: unknown[]) => pipelineMock(...args),
  env: { cacheDir: null as string | null },
}));

async function freshWorkerModule() {
  vi.resetModules();
  return import("./worker");
}

describe("worker.ts handleRequest", () => {
  beforeEach(() => {
    pipelineMock.mockReset();
  });

  it("resolves with translated text on a successful pipeline() + inference call", async () => {
    const translator = vi.fn().mockResolvedValue([{ translation_text: "Hola mundo" }]);
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 1, text: "Hello world", language: "es" });

    expect(response).toEqual({ id: 1, ok: true, text: "Hola mundo" });
    expect(pipelineMock).toHaveBeenCalledWith("translation", "Xenova/opus-mt-en-es");
    expect(translator).toHaveBeenCalledWith("Hello world");
  });

  it("returns ok:false with a message on a pipeline() (model download) failure — no throw escapes", async () => {
    pipelineMock.mockRejectedValue(new Error("network unreachable"));
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 2, text: "Hello", language: "fr" });

    expect(response).toEqual({ id: 2, ok: false, message: "network unreachable" });
  });

  it("returns ok:false with a message on an inference-time failure from an already-loaded pipeline", async () => {
    const translator = vi.fn().mockRejectedValue(new Error("ONNX runtime error"));
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 3, text: "Hello", language: "de" });

    expect(response).toEqual({ id: 3, ok: false, message: "ONNX runtime error" });
  });

  it("rejects a request for pt without ever calling pipeline() — no doomed download attempt", async () => {
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 4, text: "Hello", language: "pt" });

    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.message).toMatch(/No verified model/);
    expect(pipelineMock).not.toHaveBeenCalled();
  });

  it("loads a language's pipeline only once across repeated requests (process-lifetime cache)", async () => {
    const translator = vi.fn().mockResolvedValue([{ translation_text: "translated" }]);
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    await handleRequest({ id: 5, text: "first", language: "it" });
    await handleRequest({ id: 6, text: "second", language: "it" });

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(translator).toHaveBeenCalledTimes(2);
  });
});
