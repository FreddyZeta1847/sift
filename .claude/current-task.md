# Current Task — Live Discussion Log

> The single working surface during feature exploration. ALL in-progress
> reasoning, decisions, tradeoffs, and open questions live here as the
> conversation happens. Nothing goes to `vault-sift/` until a feature is fully
> discussed and divided into sub-features. Read this first to resume.

## Now exploring
Phase 1, Step 2 — feature-by-feature exploration for "sift" (see _features.md for the
8-feature list). INGESTION, CURATION-ENGINE, and DRAFT-GENERATOR are DONE (written to
vault-sift/features/). Next up: REVIEW-WORKSPACE (light pass).

## Decisions so far
- Project breakdown locked (7 features):
  1. **Ingestion** — pulls raw items daily from RSS/TLDR/online sources (AI/ML/cybersecurity/robotics)
  2. **Curation Engine** — LLM ranks/filters pulled items down to top 3 most important/hyped
  3. **Draft Generator** — LLM writes 3 LinkedIn posts (in user's voice) + 3 image-gen prompts.
     Includes **Voice Profile** as a component sub-feature (not standalone) — folded in since
     voice only exists to serve drafting, no independent lifecycle needed for v1.
  4. **Review Workspace** — where drafts land for human review/edit/discard and the "copy one,
     post it" hand-off. Separate from vault-sift/ (planning) — this is a runtime output dir.
  5. **Scheduler** — runs the pipeline end-to-end 4-5x/week (ingestion -> curation -> drafting -> review)
  6. **Config UI** — web UI for API keys, prompts, sources, schedule, voice settings. Core to the
     "open source, playable by everybody" requirement.
  7. **Storage/History** — standalone persistence layer: dedup ingested items across runs, archive
     past drafts, track what was published/edited. Other features (Ingestion, Review Workspace,
     Scheduler) read/write to it rather than each keeping local state.
  8. **Distribution & Trust** — combined feature (not split) covering: OSS packaging (README,
     LICENSE, one-command setup, Docker, contribution docs) AND cross-cutting safety (secrets/API
     key handling, rate limits, defending against malicious/adversarial content injected via RSS
     items, content-safety guardrails on LLM-generated output before it reaches the user). This is
     distinct from each feature's own default `--security`/`--resilience` sub-features, which cover
     that feature's local threat/failure surface — this feature owns the project-wide posture and
     the self-hosting experience.

## Open questions
- None blocking.

## Project scope flag (locked)
This is a **side project, ~1-2 weeks of build time**, for the user's own use first
(open source as a bonus, not an enterprise product). This changes HOW we discuss the
remaining features, not WHAT they are:
- **Lightweight/fast pass**: INGESTION, CURATION-ENGINE, DRAFT-GENERATOR, REVIEW-WORKSPACE,
  CONFIG-UI, STORAGE-HISTORY — get through these with sensible defaults, don't over-discuss.
- **Deeper focus** (the parts the user actually cares about): 
  - **SCHEDULER** (feature 5)
  - **DISTRIBUTION-TRUST** (feature 8)
  - **Cost-safe LLM calls** — controlling/guarding LLM API spend (budget caps, avoiding
    runaway calls). Not a standalone 9th feature; it's a cross-cutting concern that shows
    up mainly inside DISTRIBUTION-TRUST's safety angle, but also touches CURATION-ENGINE
    and DRAFT-GENERATOR since that's where the actual LLM calls happen. Flag this
    explicitly in DISTRIBUTION-TRUST's discussion and wherever LLM calls are designed.

## Cross-cutting decisions (apply to all features)
- **Tech stack (locked)**: Full TypeScript, Next.js monorepo. Serves Config UI + pipeline
  logic (API routes/server actions) from one codebase. One `npm install` for contributors.
- **Storage engine (locked)**: SQLite (single local .db file) for seen-item hashes / dedup
  and run history — no external DB service needed.
- **Pipeline output format (locked)**: `results/` directory at the **repo root** (NOT inside
  vault-sift/ — this is runtime output, not planning). One JSON file per pipeline run, named
  by day (e.g. `results/2026-07-15.json`). JSON only — no companion `.md` (dropped as
  redundant). Each file holds the 3 chosen posts, each with: `id`, `url` (source reference),
  `text` (the post body, formatted with bullet points/emoji), `imagePrompt`. This file is
  what REVIEW-WORKSPACE reads from and STORAGE-HISTORY archives.

## Feature: INGESTION — DONE
Fully discussed and written to vault-sift/features/INGESTION/ (parent + 7 sub-features).
See that folder for the authoritative design; no longer tracked here.

## Deep focus: cost-safe LLM calls (locked design)
Cross-cutting mechanism, canonical home will be a DISTRIBUTION-TRUST component
(`DISTRIBUTION-TRUST--llm-cost-safety`, written when we reach that feature). CURATION-ENGINE
and DRAFT-GENERATOR (the two features that actually call an LLM) link to it rather than
duplicate. Design:
- **Provider abstraction**: pluggable, OpenAI-compatible-first (covers OpenAI itself,
  OpenRouter, NVIDIA NIM/"build.nvidia.com" free tier, local endpoints like Ollama — all
  speak the same chat-completions wire format) + a native Anthropic SDK adapter for Claude.
  Config UI stores: provider, base URL, API key, model name.
- **Per-task model assignment**: user-configurable per pipeline stage (curation model vs
  drafting model), like Claude Code's model config — defaults to one model if only one is
  set, but can be overridden independently per task. Free/local models can be assigned to
  either stage with zero cost concern.
- **Budget tracking**: every LLM call logs `{timestamp, provider, model, inputTokens,
  outputTokens, estimatedCost}` to SQLite (STORAGE-HISTORY). Cost computed via a per-model
  $/token table in config; unknown/free/local models default to $0, which naturally makes
  budget enforcement a no-op for them.
- **Enforcement**: a configurable monthly $ cap (Config UI). Before each call, sift sums
  current month's estimatedCost so far; if this call would exceed the cap, the call is
  refused.
- **Input guard**: independent of $ — cap the number of items entering the curation prompt
  (e.g. top ~40 by recency/source diversity) so a huge news day can't balloon token usage
  structurally, regardless of budget settings.
- **On cap hit or API error**: abort the run entirely, write nothing to results/, log the
  abort (status=aborted, reason=budget_cap|api_error) to STORAGE-HISTORY. No partial output.

## Feature: CURATION-ENGINE — DONE
Fully discussed and written to vault-sift/features/CURATION-ENGINE/ (parent + 7 sub-features).
See that folder for the authoritative design; no longer tracked here. Note for later: its
--technologies/--caching link out to DISTRIBUTION-TRUST--llm-cost-safety (not yet written).

## Feature: DRAFT-GENERATOR — DONE
Fully discussed and written to vault-sift/features/DRAFT-GENERATOR/ (parent + 8 sub-features,
including the detailed article-fetch-safety design in --security). See that folder for the
authoritative design; no longer tracked here. Note for later: its --technologies/--caching
link out to DISTRIBUTION-TRUST--llm-cost-safety (not yet written).

## Minimum model capability floor (locked, small addition to Distribution & Trust scope)
Since any user can plug in any model (including tiny/weak local ones), DISTRIBUTION-TRUST
will document a recommended minimum tier (roughly Llama-3-8B / GPT-3.5-turbo class or
stronger — small models tend to fail at reliable structured JSON output) plus a "test this
model" button in CONFIG-UI that sends a trivial structured-output probe and warns if it
fails. Combined with the id-drop / entry-drop tolerance above, weak models degrade
gracefully instead of breaking a run. To be written when DISTRIBUTION-TRUST is authored.

## Next step
Dispatch vault-architect to write CURATION-ENGINE and DRAFT-GENERATOR together (they're
tightly coupled via the shared voice/interest profile). Then continue light pass:
REVIEW-WORKSPACE, CONFIG-UI, STORAGE-HISTORY. Deep focus still pending: SCHEDULER,
DISTRIBUTION-TRUST (including llm-cost-safety and the min-model-capability note above).
