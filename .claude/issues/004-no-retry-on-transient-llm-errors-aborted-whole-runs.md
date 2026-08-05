# 004 — No retry on transient LLM errors meant a single timeout/429/503 aborted the whole pipeline run

**Type:** real code gap — a documented lesson from issue 002 was never turned into code.
**Project where found:** sift.
**Cost:** low-medium — root cause was fast to find (graphify pointed straight at `callLLM` and the
existing `DRAFT-GENERATOR--resilience.md`/issue 002 docs), but it's the kind of bug that would have
kept recurring silently (aborted runs logged as `api_error` with no obvious next step) until traced.

## What happened

A real pipeline run aborted with:
```
[sift] Pipeline run 43 aborted (api_error): LLM call failed: https://generativelanguage.googleapis.com/v1beta/openai timed out after 180000ms
```
Curation and Draft Generator each make exactly **one** LLM call per run (drafting batches every
curated item into a single call — `lib/draft/generate.ts`). `run-pipeline.ts`'s `executePipelineRun`
catches any error from either stage and aborts the entire run immediately — by design, per
`DRAFT-GENERATOR--resilience.md` and `CURATION-ENGINE--resilience.md` ("hard failure aborts the
run"). But that abort-on-failure design never distinguished a permanently broken call (bad auth,
bad model) from a transient provider-side signal (timeout, `429` quota, `503` overload) — even
though issue 002 already documented, from direct testing, that `429`/`503` on free-tier endpoints
"resolve on retry with no code change needed." That lesson was written down but never implemented.

## Root cause

`lib/llm/provider.ts`'s `callOpenAICompatible` (the hand-rolled `fetch()` path used for any
OpenAI-compatible endpoint, including Gemini's `/v1beta/openai`) had zero retry logic — any timeout
or non-2xx status threw immediately and propagated straight to the pipeline's hard-failure abort.
The Anthropic SDK path (`callAnthropic`) was never affected by this — the SDK already retries
transient failures internally via its `maxRetries` client option (default 2).

## Fix applied

Added a bounded retry (3 attempts total, 2s/8s backoff) inside `callOpenAICompatible`, scoped to
exactly three transient conditions: request timeout (abort), HTTP `429`, HTTP `503`. Any other
error (auth, bad request, malformed response) still throws on the first attempt, unchanged — this
doesn't loosen the "hard failure aborts the run" contract, it just makes sure only a real failure
reaches it. Updated `DRAFT-GENERATOR--resilience.md` and `CURATION-ENGINE--resilience.md` to
document the retry-before-abort step. Added tests in `lib/llm/provider.test.ts` covering: a
non-transient status doesn't retry, a transient status retries and can still succeed, and a
persistently transient status exhausts all attempts before throwing.

## Lesson for future projects

1. **Writing a lesson down in an issue file doesn't make it code.** Issue 002 already said "429/503
   just need a retry" — but the actual retry logic was never added. When a debugging session
   concludes "this is just how the provider behaves, retry and move on," check whether the
   *code* actually retries, not just whether a human knows to.
2. **A single LLM call being the entire pipeline stage is a single point of failure worth naming.**
   Curation and Draft Generator each depend on exactly one call succeeding; that's a deliberate,
   documented design (partial/malformed *output* soft-fails, but a failed *call* hard-fails) — which
   makes retry-before-hard-failure the natural place to absorb transient flakiness without touching
   the hard/soft split itself.
3. **Check whether a wrapping SDK already retries before adding your own loop.** The Anthropic SDK
   already had `maxRetries` built in; only the hand-rolled fetch path needed the fix. Retrying twice
   (once in a library, once in your own code) is easy to accidentally do if you don't check first.
