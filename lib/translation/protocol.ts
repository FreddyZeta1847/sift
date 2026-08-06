/**
 * Wire message shapes shared between the main-thread caller
 * (translate.ts) and the worker-thread inference code (worker.ts).
 * A plain, serializable request/response pair rather than passing Error
 * objects across postMessage — Node's structured-clone of an Error
 * preserves `message` but not a custom `.name`, which is what this
 * module's error-kind reporting depends on. Compiled alongside worker.ts
 * by tsconfig.worker.json, so it must stay free of anything that can't
 * survive being loaded as plain Node ESM outside Next's bundler.
 */
import type { Language } from "./models.js";

export interface TranslateRequest {
  id: number;
  text: string;
  language: Language;
}

export type TranslateResponse =
  | { id: number; ok: true; text: string }
  | { id: number; ok: false; message: string };
