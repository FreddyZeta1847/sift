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
// Each non-blank line is sent to translator() individually, in its own
// call — NOT batched together into one translator() call with all of a
// post's lines. This used to be batched for efficiency (one model
// invocation per post instead of one per line), but that batching was
// itself the cause of a real, user-reported bug: when a batch mixes
// sequences of very different lengths (a short bullet next to a long
// paragraph), transformers.js's generate() loop doesn't stop early for
// the sequences that already hit their own EOS token — it keeps
// running extra steps until the LONGEST sequence in the batch is done,
// and the already-finished sequences get padding-token output appended
// for those extra steps. For this Marian model's vocabulary, that
// padding decodes as repeated "." characters, so real output showed
// every translated line followed by 50-150+ trailing periods; an
// unusually short line (a hashtag-only line) forced through many extra
// steps came back completely garbled instead. This is a documented
// transformers behavior, not a bug in this file's original logic — see
// https://github.com/huggingface/transformers/issues/31261. A batch of
// size 1 has no other sequence to pad against, so calling translator()
// once per line removes the mechanism entirely.
async function translateLines(
  translator: Awaited<ReturnType<typeof loadPipeline>>,
  text: string,
): Promise<string> {
  const lines = text.split("\n");
  const hasNonBlankLine = lines.some((line) => line.trim() !== "");

  // Empty string, or a post made entirely of blank lines: nothing to
  // send to the model at all.
  if (!hasNonBlankLine) return text;

  const translatedLines: string[] = [];
  for (const line of lines) {
    if (line.trim() === "") {
      translatedLines.push(line);
      continue;
    }

    // Hashtags must stay in English: LinkedIn's hashtag search/discovery
    // is per literal tag, so "#MachineLearning" translated into another
    // language no longer matches the English hashtag community readers
    // search for — translating it doesn't help and, per the same batch
    // bug above, this model also garbled hashtag-only lines badly (they
    // are usually the shortest line in a post, so historically the most
    // exposed to the padding artifact). Only a line made ENTIRELY of
    // "#word" tokens is skipped untranslated; a line that merely mentions
    // a hashtag partway through normal text is still translated below.
    if (isHashtagOnlyLine(line)) {
      translatedLines.push(line);
      continue;
    }

    const [result] = await translator([line]);
    translatedLines.push(stripTrailingPaddingArtifact(result.translation_text));
  }

  return translatedLines.join("\n");
}

// True only when EVERY whitespace-separated token on the line is a
// "#word" hashtag — e.g. "#AIAgents #MachineLearning #LLM". A line that
// contains normal prose with a hashtag partway through (e.g. "Check out
// #AI trends this year") must still return false so it goes through
// translateLines()'s normal per-line translation path above.
function isHashtagOnlyLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === "") return false;
  return trimmed.split(/\s+/).every((token) => /^#\w+$/.test(token));
}

// Defensive second layer against the padding-token artifact described
// above (see translateLines()'s comment) — translating one line at a
// time removes the shared-batch-length mechanism that causes it, but
// this strip stays as a safety net in case a single-line call still
// surfaces padding output for some input. Requires 8+ consecutive
// repeats of the SAME non-word, non-space character right at the end of
// the string (optionally followed by trailing whitespace) — high enough
// that it never touches legitimate short punctuation runs like an
// actual "..." ellipsis or emphasis like "!!", but well below the
// 50-150+ character runs seen in the real bug report. Not hardcoded to
// "." specifically since a different model's padding token could decode
// as a different repeated character.
const TRAILING_PADDING_RUN = /([^\w\s])\1{7,}\s*$/;

function stripTrailingPaddingArtifact(text: string): string {
  return text.replace(TRAILING_PADDING_RUN, "").trimEnd();
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
