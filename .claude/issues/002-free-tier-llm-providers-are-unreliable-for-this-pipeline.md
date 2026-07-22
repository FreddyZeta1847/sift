# 002 — Free-tier/shared-endpoint LLM providers (NVIDIA NIM, Gemini) surfaced real reliability limits, not code bugs

**Type:** operational reality of third-party providers, not a bug — but cost real time to correctly
attribute, since several symptoms initially looked like problems in sift's own code.
**Project where found:** sift, but the underlying lessons generalize to any project calling
free-tier/shared LLM endpoints.
**Cost:** high — a long live-debugging session across two providers and roughly a dozen candidate
models, each requiring its own direct API reproduction to tell "broken model/config" apart from
"provider is just slow/overloaded/needs a bigger budget right now."

## What happened

Trying to get sift's curation/drafting pipeline reliably producing posts, using NVIDIA NIM
(`integrate.api.nvidia.com`, free tier) and then Google Gemini (`generativelanguage.googleapis.com`,
free tier) as the LLM provider. Real, repeatedly observed failure modes:

1. **Some models on NVIDIA NIM's catalog page are not actually live-hosted.** `z-ai/glm-5.2` and
   `qwen/qwen3-next-80b-a3b-instruct` both hung completely — no response, not even HTTP headers —
   at timeouts up to 120s, regardless of streaming vs. non-streaming. `meta/llama-3.1-8b-instruct`
   and `meta/llama-3.1-70b-instruct` on the same endpoint with the same key responded in under a
   few seconds. Some entries on a provider's public model catalog are effectively unavailable via
   the shared API, or have far higher latency than the catalog page implies, with no distinguishing
   signal from the API itself (a clean-looking hang, not an error).
2. **Free-tier quota limits are real, per-model, and can be intermittent.** Several Gemini models
   (`gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-3-pro-preview`) returned `429` even on a fresh key
   with plenty of unused daily allowance elsewhere — quota is apparently allocated per-model, not
   just per-account, and can be exhausted by a short burst of testing.
3. **Preview/newer models can return `503 UNAVAILABLE` ("high demand")** — a transient,
   provider-side overload signal, distinct from a real configuration problem, that resolves itself
   on retry with no code change needed.
4. **Reasoning models silently consume the output-token budget on hidden thinking before writing
   any visible answer — sometimes 90%+ of it.** Measured directly: a real curation call to
   Gemini's `gemini-flash-latest` with a 1000-token budget spent ~957 tokens on hidden reasoning,
   leaving only 39 visible tokens before hitting the cap (`finish_reason: "length"`) — the JSON
   got cut off mid-structure. The same pattern hit sift's own "Test this model" probe, which used
   only 20 max_tokens (fine for a non-reasoning model, but enough for a reasoning model to spend
   its *entire* budget on invisible thinking and return a response with no `content` field at all)
   — a real, working model+key+endpoint reported as "unreachable" purely because of this.

## Root cause

None of these are code bugs in the traditional sense — they're real operating characteristics of
free-tier, shared, and/or reasoning-enabled LLM endpoints that a token-budget/timeout tuned for a
"classic" non-reasoning model (fast, deterministic-ish latency, output tokens ≈ visible tokens)
doesn't account for. The closest thing to an actual code defect was case 4's *symptom* inside
`probeModel()`: missing/empty content from a real, working call was miscategorized as
`"unreachable"` (implying a connectivity/credentials problem) because of a generic `catch` block,
rather than being recognized as `"fail"` (a model-capability/budget problem) — see the fix below.

## Fix applied

- Bumped every output-token budget that was sized for non-reasoning models: curation's
  `MAX_OUTPUT_TOKENS` (1000 → 4000, `lib/curation/run.ts`), the model-test probe's budget
  (20 → 200, `lib/config/test-model-probe.ts`). Drafting's was already generous (8000).
- Bumped the LLM call timeout (90s → 180s, `lib/llm/provider.ts`) after measuring a real drafting
  call take 116s against a working, non-broken 70B model.
- Fixed `probeModel()` to explicitly check for missing/empty response content and report `"fail"`
  (a model/budget problem) rather than letting it crash into the generic `"unreachable"` catch
  (implying connectivity/credentials, which was never the actual issue).
- No fix applied for cases 1-3 above — these are genuinely external, provider-side conditions.
  The practical response was diagnostic, not a code change: reproduce the exact failing call
  directly against the real endpoint (bypassing the app) to see the real HTTP status/timing/error
  body, which reliably distinguishes "this model isn't really available" (hangs with no response)
  from "this model needs a bigger budget" (`finish_reason: "length"`, near-total token spend on
  reasoning) from "transient overload, just retry" (`503`, explicit "try again later" message).

## Lesson for future projects

1. **A model responding on a provider's public catalog/playground doesn't guarantee it's live on
   the shared inference API** — verify with a direct, minimal API call before trusting a model
   name, the same way you'd verify any other external dependency. A clean hang with no error is a
   real, distinct failure signature from an actual error response — don't treat them the same.
2. **Any timeout or max-output-tokens value tuned by only testing non-reasoning models will
   systematically fail once a reasoning-capable model is swapped in** — reasoning tokens consume
   real budget and real time before any visible output exists, and this isn't reflected in a
   naive request's prompt/output size. Size both generously, and specifically re-test after any
   model swap rather than assuming a working config transfers.
3. **When a response comes back empty or missing expected fields, don't lump that in with
   "unreachable"/"connection failed."** A model that responded successfully but produced nothing
   usable is a different failure category (capability or budget, fixable by a config change) from
   one that never responded at all (genuinely a connectivity/provider problem) — conflating them
   sends whoever's debugging it toward the wrong fix.
4. **429 (quota) and 503 (overload) are meaningfully different from every other failure**: both
   are provider-side signals that explicitly mean "this isn't a config/code problem, try again
   later (or with a different model)" — don't spend debugging time treating them as symptoms to
   fix in your own code.
