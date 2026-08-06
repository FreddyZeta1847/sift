/**
 * Fixed language -> Hugging Face model repo id mapping for local
 * translation (5 separate Marian/OPUS-MT models, not one multilingual
 * model — see TRANSLATION--technologies.md's tradeoff table). Not a
 * CONFIG-UI setting: this list is a fixed part of the feature, so
 * swapping one language's model to a different repo is a one-line change
 * here, not a refactor of every call site.
 *
 * Repo existence was verified against the HF Hub at implementation time
 * (`curl -sI https://huggingface.co/<repo>/resolve/main/config.json` /
 * the Hub's `/api/models/<repo>` endpoint):
 *   - en-es, en-fr, en-de, en-it: confirmed to exist under the Xenova
 *     namespace (200 from the Hub API, transformers.js-tagged ONNX repo).
 *   - en-pt: does NOT exist under the Xenova namespace. The Hub returns
 *     the same generic 401 "Invalid username or password" for this repo
 *     id as it does for a deliberately-nonexistent control id — that is
 *     the Hub's anonymous-request response for "no such public repo",
 *     not an auth problem on our side. This was an explicitly flagged,
 *     not-yet-resolved open caveat at design time (see
 *     TRANSLATION--technologies.md's "Open caveat, not blocking").
 *
 * Per implementation instructions, this file does not substitute a
 * different (unverified/community) repo id for en-pt, and does not
 * perform the one-time `optimum-cli export onnx --quantize` conversion
 * the design doc floats as the eventual fix — both are judgment calls
 * for the maintainer, not something to decide mid-implementation. The
 * id below is kept as the plan's own illustrative placeholder, and
 * UNAVAILABLE_LANGUAGES marks it as known-not-to-work so callers (see
 * ./translate.ts) fail fast with a clear, typed error instead of
 * discovering the 401 several layers down inside model download.
 */
export type Language = "es" | "fr" | "de" | "it" | "pt";

export const MODEL_BY_LANGUAGE: Record<Language, string> = {
  es: "Xenova/opus-mt-en-es",
  fr: "Xenova/opus-mt-en-fr",
  de: "Xenova/opus-mt-en-de",
  it: "Xenova/opus-mt-en-it",
  // Placeholder only — confirmed NOT to exist on the Hub. See file header.
  pt: "Xenova/opus-mt-en-pt",
};

// Languages whose MODEL_BY_LANGUAGE entry is not a real, verified repo.
// Kept as its own export (rather than silently dropping "pt" from the
// Record above) so the DB-level language enum, which does include "pt"
// per TRANSLATION--architecture.md's locked schema, stays in sync with
// this module without a type mismatch.
export const UNAVAILABLE_LANGUAGES: ReadonlySet<Language> = new Set(["pt"]);
