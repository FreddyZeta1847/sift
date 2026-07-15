# Current Task — Live Discussion Log

> The single working surface during feature exploration. ALL in-progress
> reasoning, decisions, tradeoffs, and open questions live here as the
> conversation happens. Nothing goes to `vault-sift/` until a feature is fully
> discussed and divided into sub-features. Read this first to resume.

## Now exploring
Phase 1, Step 2 — feature-by-feature exploration for "sift" (see _features.md for the
8-feature list). INGESTION, CURATION-ENGINE, DRAFT-GENERATOR (revision pending, see below),
and REVIEW-WORKSPACE are DONE (written to vault-sift/features/). Next up: CONFIG-UI or
STORAGE-HISTORY (light pass) — STORAGE-HISTORY's shape is now partially informed by decisions
made during REVIEW-WORKSPACE (drafts table schema, retention policy, dedup hash separation),
so it may make sense to do STORAGE-HISTORY next rather than strictly in listed order.

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
- **Pipeline output format (SUPERSEDED, revised 2026-07-15)**: ~~`results/` directory,
  one JSON file per run~~ — dropped. DRAFT-GENERATOR now writes the 3 drafted posts directly
  as rows into a SQLite **drafts table** (owned by STORAGE-HISTORY, canonical schema/retention
  design to be written when that feature is authored), no intermediate file. Reason: avoids a
  two-source (file + DB) merge on every REVIEW-WORKSPACE page load and file-write races;
  STORAGE-HISTORY already owns SQLite for dedup, so this reuses one persistence mechanism
  instead of two. Row shape: `id`, `runDate`, `url`, `originalText` (untouched LLM output,
  audit trail), `editedText` (nullable, set on user edit), `imagePrompt`, `discarded` (bool),
  `posted` (bool), `postedAt`. Display rule: `editedText ?? originalText`.
  - **Retention (locked)**: configurable in CONFIG-UI — keep the drafts table's rows for the
    last N pipeline runs (default TBD when CONFIG-UI is designed), OR "never discard" if the
    user sets unlimited retention. Pruning is uniform (age-based, not posted/discarded-based —
    a posted draft ages out the same as an unposted one, since once posted it already lives on
    LinkedIn). Runs at the end of each pipeline run.
  - **Explicit exception**: this retention window applies ONLY to the drafts table. INGESTION's
    seen-item dedup hashes are a separate table with independent (much longer/indefinite)
    retention — pruning drafts must never touch or be confused with the dedup hash table,
    otherwise old articles would look "unseen" again and get re-ingested.
  - **Ripple effect**: DRAFT-GENERATOR is already fully written in the vault referencing the
    old JSON format — its `--post-generation` (and possibly `--architecture`) sub-feature(s)
    need revision to match, and its recap needs rebuilding once revised.
- **Pipeline execution model (clarified, not previously stated)**: the whole pipeline
  (INGESTION → CURATION-ENGINE → DRAFT-GENERATOR) runs as one synchronous/async chain within a
  single process, passing data as in-memory objects between stages — no queue, no intermediate
  disk writes. SQLite is touched only twice: seen-item hash check/write during INGESTION, and
  the final drafts-table write at the end of DRAFT-GENERATOR. The ~40 candidate items
  CURATION-ENGINE considers but doesn't pick are never persisted — memory-only for the run.
- **Scheduler execution model (clarified — full design still deferred to SCHEDULER's own deep
  pass)**: NOT a GitHub Action (no access to the user's local filesystem/SQLite, and requires
  per-user CI setup — fights the one-command self-hosted goal). Instead: an in-process
  scheduler (e.g. `node-cron`) running inside the same long-lived Next.js server process
  (`npm start`, or the Docker container DISTRIBUTION-TRUST will package), firing the pipeline
  directly in-process on the configured days. Consequence: automation only happens while the
  process is alive — if the machine/app is off, no run happens; "fully automated" requires the
  user to keep it running somewhere always-on (own choice: leave laptop on, home server, NAS,
  small VPS). Open question for SCHEDULER's dedicated pass: missed-run behavior (silently skip,
  or catch up on next startup?).

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

## Feature: REVIEW-WORKSPACE — DONE
Fully discussed and written to vault-sift/features/REVIEW-WORKSPACE/ (parent + 5 defaults + 1
component). Locked design summary (authoritative version lives in the vault):
- Page: `app/review/page.tsx` in the same Next.js app as CONFIG-UI. `?date=` query param picks
  which run to view (no dynamic route needed). Server Actions for all mutations (edit/discard/
  mark-posted), no separate API route layer.
- Data: reads directly from the SQLite drafts table (see revised "Pipeline output format"
  above) — no JSON file involved anywhere in this feature.
- UI: one page, 3 cards stacked vertically per run. Editable textarea (autosaves on blur, no
  Save button), read-only image prompt + "Copy prompt" button, primary "Copy & Mark Posted"
  button (single combined action — copies to clipboard and flags posted in one click), secondary
  "Discard" button (one-way, no undo in the UI — data isn't deleted, just flagged/muted;
  acceptable for a single-user low-stakes tool). Posted/discarded cards stay visible but
  visually muted rather than disappearing.
- Explicitly deferred as overkill for this scope: auth, external state library, rich text
  editor, edit-history/versioning, cross-tab sync, pagination, an approval-workflow engine.
- Note: the "Copy & Mark Posted" combined-action and "no-undo discard" choices were the
  frontend-architect's original recommendation, adopted by default (light pass) — flag if this
  needs revisiting later.

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
