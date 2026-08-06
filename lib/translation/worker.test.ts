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
    // Each line is sent as its own one-element-array call — never
    // batched together with any other line — so a batch never contains
    // sequences of different lengths. See worker.ts's translateLines()
    // comment for why that matters.
    expect(translator).toHaveBeenCalledWith(["Hello world"]);
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

  it("translates each paragraph of a multi-paragraph post individually and preserves the blank-line separators", async () => {
    // Mirrors a real LinkedIn post: two paragraphs and a bullet point,
    // separated by blank lines. (The trailing hashtag-only line case is
    // covered separately below, since it must NOT reach the translator.)
    const input = ["Paragraph one.", "", "Paragraph two.", "- Bullet point"].join("\n");
    const translator = vi.fn().mockImplementation((lines: string[]) =>
      Promise.resolve(lines.map((line) => ({ translation_text: `[ES] ${line}` }))),
    );
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 7, text: input, language: "es" });

    // Only the non-blank lines are sent to the model, one call per line —
    // never batched together, since a mixed-length batch is exactly what
    // triggers the padding-artifact bug (see worker.ts).
    expect(translator).toHaveBeenCalledTimes(3);
    expect(translator).toHaveBeenNthCalledWith(1, ["Paragraph one."]);
    expect(translator).toHaveBeenNthCalledWith(2, ["Paragraph two."]);
    expect(translator).toHaveBeenNthCalledWith(3, ["- Bullet point"]);
    expect(response).toEqual({
      id: 7,
      ok: true,
      text: ["[ES] Paragraph one.", "", "[ES] Paragraph two.", "[ES] - Bullet point"].join("\n"),
    });
  });

  it("passes a hashtag-only line through untranslated without ever calling the translator for it", async () => {
    const input = ["Great news today.", "", "#AIAgents #MachineLearning #PromptEngineering #LLM"].join("\n");
    const translator = vi.fn().mockImplementation((lines: string[]) =>
      Promise.resolve(lines.map((line) => ({ translation_text: `[ES] ${line}` }))),
    );
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 10, text: input, language: "es" });

    // Only the prose line reaches the translator; the hashtag-only line
    // is never passed to it.
    expect(translator).toHaveBeenCalledTimes(1);
    expect(translator).toHaveBeenCalledWith(["Great news today."]);
    expect(response).toEqual({
      id: 10,
      ok: true,
      text: ["[ES] Great news today.", "", "#AIAgents #MachineLearning #PromptEngineering #LLM"].join("\n"),
    });
  });

  it("still translates a line that only mentions a hashtag partway through normal text", async () => {
    const input = "Check out #AI trends this year";
    const translator = vi.fn().mockResolvedValue([{ translation_text: "[ES] Check out #AI trends this year" }]);
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 11, text: input, language: "es" });

    expect(translator).toHaveBeenCalledTimes(1);
    expect(translator).toHaveBeenCalledWith([input]);
    expect(response).toEqual({ id: 11, ok: true, text: "[ES] Check out #AI trends this year" });
  });

  it("strips a long trailing run of repeated periods left over from the padding-token artifact", async () => {
    const garbageSuffix = ".".repeat(80);
    const translator = vi
      .fn()
      .mockResolvedValue([{ translation_text: `Hola mundo${garbageSuffix}` }]);
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 12, text: "Hello world", language: "es" });

    expect(response).toEqual({ id: 12, ok: true, text: "Hola mundo" });
  });

  it("does not mangle legitimate short punctuation like an ellipsis or emphasis marks", async () => {
    const translator = vi.fn().mockResolvedValue([{ translation_text: "Espera..." }]);
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 13, text: "Wait...", language: "es" });

    expect(response).toEqual({ id: 13, ok: true, text: "Espera..." });
  });

  it("preserves consecutive blank lines and leading/trailing blank lines exactly", async () => {
    const input = ["", "", "First.", "", "", "Second.", "", ""].join("\n");
    const translator = vi.fn().mockImplementation((lines: string[]) =>
      Promise.resolve(lines.map((line) => ({ translation_text: `[FR] ${line}` }))),
    );
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 8, text: input, language: "fr" });

    expect(response).toEqual({
      id: 8,
      ok: true,
      text: ["", "", "[FR] First.", "", "", "[FR] Second.", "", ""].join("\n"),
    });
  });

  it("returns an empty string without ever calling the translator on empty input", async () => {
    const translator = vi.fn();
    pipelineMock.mockResolvedValue(translator);
    const { handleRequest } = await freshWorkerModule();

    const response = await handleRequest({ id: 9, text: "", language: "it" });

    expect(response).toEqual({ id: 9, ok: true, text: "" });
    expect(translator).not.toHaveBeenCalled();
  });
});
