/**
 * Main-thread entry point for local translation: `translate(text,
 * language)`. Delegates the actual `pipeline()` inference call to a
 * worker_thread (lib/translation/worker.ts) so an in-flight translation
 * can't block the Node.js event loop for unrelated requests, including a
 * same-process SCHEDULER pipeline run — see TRANSLATION--architecture.md.
 *
 * Deliberately a pure translation function with no database code: per
 * TRANSLATION--resilience.md, a failed download or inference call must
 * never result in a post_translations row being written. Keeping every
 * DB write out of this module entirely (rather than trying to guard a
 * write path here) is what makes that guarantee structural instead of
 * something a caller could get wrong — the (not-yet-built) Server Action
 * that calls translate() is solely responsible for inserting a row, and
 * only after this function resolves.
 *
 * A single worker is spawned lazily on first use and reused for the life
 * of the process — not respawned per call — so the worker's own
 * process-lifetime pipeline cache (see worker.ts) actually pays off
 * across repeated translations. See TRANSLATION--caching.md.
 */
import { Worker } from "node:worker_threads";
import path from "node:path";
// Extensionless, not "./models.js": unlike worker.ts (compiled separately
// to plain JS by tsconfig.worker.json and run outside Next's bundler —
// see workerScriptPath() below), this file IS part of Next's own module
// graph once a Server Action imports translate(). Next's webpack build
// resolves extensionless ".ts" imports fine (matching every other import
// in this codebase) but does NOT do TypeScript's "Bundler" moduleResolution
// .js -> .ts mapping — a ".js" specifier here fails to resolve at build
// time even though `tsc --noEmit` type-checks it fine (found by actually
// running `next build`, per this phase's explicit integration-risk callout).
import { MODEL_BY_LANGUAGE, UNAVAILABLE_LANGUAGES, type Language } from "./models";
import type { TranslateRequest, TranslateResponse } from "./protocol";

// A model download or inference failure inside the worker, or a worker
// crash/exit. Distinct from TranslationUnavailableError so a caller can
// tell "this language isn't wired up at all" apart from "this specific
// attempt failed and can be retried" — matching the resilience doc's
// "no auto-retry, user re-triggers manually" for the latter only.
export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationError";
  }
}

// A language present in the DB's language enum but with no verified,
// working model configured yet — see models.ts. Thrown before the
// worker is ever involved: no worker spawn, no download attempt, no
// pipeline_runs-style side effect for something that can never succeed
// today.
export class TranslationUnavailableError extends Error {
  constructor(language: Language) {
    super(`Translation to "${language}" is not available: no verified model is configured for it yet.`);
    this.name = "TranslationUnavailableError";
  }
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function workerScriptPath(): string {
  // `new Worker(filename)` resolves a relative filename against
  // process.cwd(), not against this module's own location (verified
  // empirically — see the sub-feature's worker_thread notes) — the same
  // reason lib/db/migrate.ts references "./drizzle" rather than a path
  // derived from import.meta.url. That matters here specifically because
  // translate.ts gets bundled into a Next.js server chunk once a caller
  // imports it, at which point import.meta.url would point inside
  // .next/server/, not lib/translation/.
  return path.join(process.cwd(), "lib", "translation", "dist", "worker.js");
}

function rejectAllPending(err: Error): void {
  for (const { reject } of pending.values()) reject(err);
  pending.clear();
}

function getWorker(): Worker {
  if (workerInstance) return workerInstance;

  const worker = new Worker(workerScriptPath());

  worker.on("message", (response: TranslateResponse) => {
    const request = pending.get(response.id);
    if (!request) return; // Already settled (e.g. by a prior crash) or unknown id.
    pending.delete(response.id);
    if (response.ok) {
      request.resolve(response.text);
    } else {
      request.reject(new TranslationError(response.message));
    }
  });

  // A crash inside the worker (e.g. an ONNX runtime native fault) is
  // contained to that worker, per TRANSLATION--resilience.md — it must
  // not take down the main process or leave in-flight callers hanging
  // forever. Reject whatever was in flight and drop the worker instance
  // so the next translate() call transparently spawns a fresh one.
  worker.on("error", (err) => {
    rejectAllPending(new TranslationError(`Translation worker crashed: ${err.message}`));
    workerInstance = null;
  });

  worker.on("exit", (code) => {
    if (code !== 0) {
      rejectAllPending(new TranslationError(`Translation worker exited unexpectedly (code ${code})`));
    }
    workerInstance = null;
  });

  workerInstance = worker;
  return worker;
}

/**
 * Translates English `text` into `language` using the matching local
 * Marian/OPUS-MT model, per lib/translation/models.ts. Resolves with the
 * translated text on success; rejects with TranslationUnavailableError
 * (language has no working model yet) or TranslationError (download or
 * inference failure) otherwise. Never touches the database — see this
 * file's header.
 */
export function translate(text: string, language: Language): Promise<string> {
  if (UNAVAILABLE_LANGUAGES.has(language)) {
    return Promise.reject(new TranslationUnavailableError(language));
  }
  // MODEL_BY_LANGUAGE is a Record<Language, string> covering every
  // Language variant, so this is unreachable for a validly-typed caller
  // — kept as a defensive check against a value that only satisfies the
  // type at a boundary (e.g. a raw DB row read back as `string`).
  if (!(language in MODEL_BY_LANGUAGE)) {
    return Promise.reject(new TranslationUnavailableError(language));
  }

  const worker = getWorker();
  const id = nextRequestId++;
  const request: TranslateRequest = { id, text, language };

  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage(request);
  });
}
