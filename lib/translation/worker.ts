/**
 * Worker-thread entry point for local translation inference.
 *
 * Loaded via `new Worker(...)` from lib/translation/translate.ts — never
 * imported directly by any Next.js route/action/page or by vitest, so it
 * cannot rely on Next's or vitest's own TypeScript handling. It is
 * compiled ahead of time to plain, directly Node-runnable ESM by
 * `npm run build:worker` (see tsconfig.worker.json) and loaded at
 * runtime from lib/translation/dist/worker.js.
 *
 * Runs pipeline() off the main thread's event loop so an in-flight
 * translation can't block unrelated requests, including a same-process
 * SCHEDULER pipeline run — see TRANSLATION--architecture.md. Keeps a
 * process-lifetime cache of loaded pipelines, one per language, never
 * evicted in v1, so the second and later translations into a given
 * language skip both the download and the model-load step — see
 * TRANSLATION--caching.md.
 */
import { parentPort } from "node:worker_threads";
import { pipeline, env } from "@huggingface/transformers";
import { MODEL_BY_LANGUAGE, UNAVAILABLE_LANGUAGES, type Language } from "./models.js";
import type { TranslateRequest, TranslateResponse } from "./protocol.js";

// Must be set before the first pipeline() call so downloaded model
// weights land inside the Docker deployment's persisted ./data volume
// instead of the library's unconfigured default cache location, which
// isn't guaranteed to survive a container recreate — see
// TRANSLATION--technologies.md and TRANSLATION--caching.md. Mirrors
// lib/db/client.ts's SIFT_DB_PATH convention: docker-compose.yml sets
// SIFT_MODELS_PATH to the Docker-mounted absolute path in production; the
// plain relative fallback keeps local dev/tests writing inside the repo
// instead of at a filesystem root.
env.cacheDir = process.env.SIFT_MODELS_PATH ?? "data/models";

// Promise cache, not just a resolved-value cache: two overlapping
// first-time requests for the same language must share one in-flight
// pipeline() load rather than triggering a duplicate download.
const pipelineCache = new Map<Language, ReturnType<typeof pipeline<"translation">>>();

function loadPipeline(language: Language): ReturnType<typeof pipeline<"translation">> {
  const cached = pipelineCache.get(language);
  if (cached) return cached;

  const loading = pipeline("translation", MODEL_BY_LANGUAGE[language]);
  // A failed load must not permanently poison the cache — a later retry
  // (see TRANSLATION--resilience.md's "no auto-retry, user re-triggers
  // manually") should get a fresh attempt, not a cached rejection.
  loading.catch(() => pipelineCache.delete(language));
  pipelineCache.set(language, loading);
  return loading;
}

// Marian/OPUS-MT models have no notion of line breaks as structure — a
// multi-paragraph post handed to the pipeline as one flat string comes
// back as a single collapsed blob (paragraph breaks, bullet points, and
// a trailing hashtag line all lost). Splitting on "\n" and translating
// each non-blank line separately preserves the original layout exactly;
// blank lines (including runs of them, and leading/trailing ones) are
// passed through untouched rather than sent to the model.
//
// The non-blank lines are batched into a single translator() call —
// @huggingface/transformers's translation pipeline accepts an array of
// strings and returns one result per input in order — instead of one
// call per line, so an N-line post costs one model invocation, not N.
async function translateLines(
  translator: Awaited<ReturnType<typeof loadPipeline>>,
  text: string,
): Promise<string> {
  const lines = text.split("\n");
  const nonBlankIndices: number[] = [];
  const nonBlankLines: string[] = [];
  lines.forEach((line, index) => {
    if (line.trim() !== "") {
      nonBlankIndices.push(index);
      nonBlankLines.push(line);
    }
  });

  // Empty string, or a post made entirely of blank lines: nothing to
  // send to the model at all.
  if (nonBlankLines.length === 0) return text;

  const results = await translator(nonBlankLines);
  const translatedByIndex = new Map<number, string>();
  nonBlankIndices.forEach((lineIndex, i) => {
    translatedByIndex.set(lineIndex, results[i].translation_text);
  });

  return lines.map((line, index) => translatedByIndex.get(index) ?? line).join("\n");
}

// Exported for worker.test.ts only — never imported by translate.ts or
// any other real caller, which only ever talks to this file through the
// message port above.
export async function handleRequest(request: TranslateRequest): Promise<TranslateResponse> {
  try {
    if (UNAVAILABLE_LANGUAGES.has(request.language)) {
      // Belt-and-suspenders: translate.ts already guards this on the main
      // thread before ever posting a message, but the worker must not
      // silently attempt a known-broken download if it somehow gets here.
      throw new Error(`No verified model is configured for language "${request.language}"`);
    }
    const translator = await loadPipeline(request.language);
    const text = await translateLines(translator, request.text);
    return { id: request.id, ok: true, text };
  } catch (err) {
    return { id: request.id, ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// Guarded, not asserted: this file is loaded two ways — as a real
// worker_thread (parentPort set, see translate.ts), and imported
// directly by worker.test.ts to unit-test loadPipeline()/handleRequest()
// in isolation without spawning a real thread. Only the former needs
// the message-port wiring below.
if (parentPort) {
  const port = parentPort;
  port.on("message", (request: TranslateRequest) => {
    handleRequest(request).then((response) => port.postMessage(response));
  });
}
