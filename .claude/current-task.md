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

## Feature: STORAGE-HISTORY — DONE
Fully discussed and written to vault-sift/features/STORAGE-HISTORY/. Locked design summary
(authoritative version lives in the vault):
- **Tooling (locked)**: Drizzle ORM over the `better-sqlite3` driver (sync, matching the
  locked single-process pipeline model). NOT raw `better-sqlite3` alone, NOT `node:sqlite`
  (still experimental), NOT Prisma (too heavy — codegen binary + engine process, unneeded for
  a local file DB).
  - **Why (this is the part that matters, write it into --technologies, don't just state the
    choice)**: sift is meant to be self-hosted by other people, not run once on the author's
    own machine. Every future schema change (more columns/tables as SCHEDULER, CONFIG-UI,
    DISTRIBUTION-TRUST get designed) has to apply cleanly to databases that ALREADY EXIST on
    other users' machines, exactly once, when they update the app. Drizzle tracks which
    migrations have already been applied inside each user's own .db file and auto-applies only
    what's new on startup — solving that bookkeeping automatically instead of the maintainer
    hand-writing idempotent `ALTER TABLE` checks for every change, forever, for every user.
    It also catches column-name typos at compile time (TypeScript) instead of at runtime (raw
    SQL strings). Cost: one extra (lightweight) dependency, judged worth it given the
    multi-user self-hosted context — NOT decided in a vacuum, this is a real project constraint.
- **Three tables (a 4th, `pipeline_runs`, was proposed and explicitly REJECTED as premature —
  it only existed to serve SCHEDULER's not-yet-designed missed-run catch-up logic; add it
  later as its own migration if/when SCHEDULER's dedicated pass actually decides it's needed)**:
  - `seen_items` — INGESTION's dedup hashes (id, urlHash UNIQUE, source, firstSeenAt). Indefinite
    retention — tiny rows (~10k/yr), no pruning need, and pruning here would risk re-surfacing
    old "unseen-again" articles.
  - `drafts` — matches the row shape already locked during REVIEW-WORKSPACE: id, runDate, url,
    originalText, editedText, imagePrompt, discarded, posted, postedAt. The ONLY table with
    configurable retention (last N runs, or unlimited via CONFIG-UI) — pruning here is a UX
    cleanliness choice (avoid clutter in the review view), not a storage necessity (~1-2MB/yr
    unpruned is trivial).
  - `llm_calls` — cost ledger from the cost-safe-LLM-calls decision: timestamp, provider,
    model, inputTokens, outputTokens, estimatedCost, plus a nullable `runId`-shaped link for
    future per-run cost breakdowns. Indefinite retention (~1-2k rows/yr). Used to sum current
    month's spend against DISTRIBUTION-TRUST's budget cap.
- **Migrations (locked)**: `drizzle-kit generate` produces migration SQL files checked into the
  repo (e.g. `drizzle/`). App calls Drizzle's `migrate()` once on server startup, before serving
  — idempotent, applies only unapplied migrations. No manual migration step for end users
  beyond `npm start`.
- **DB file location (locked)**: `data/sift.db` at repo root, gitignored, directory
  auto-created on bootstrap. Path configurable via `SIFT_DB_PATH` env var (default
  `data/sift.db`) so DISTRIBUTION-TRUST's future Docker packaging can mount it as a volume
  without a breaking change later.
- Every other feature that touches persistence (INGESTION for seen_items, DRAFT-GENERATOR/
  REVIEW-WORKSPACE for drafts, CURATION-ENGINE/DRAFT-GENERATOR for llm_calls) reads/writes
  through STORAGE-HISTORY's schema rather than owning any table itself — matches the
  already-established pattern (e.g. REVIEW-WORKSPACE--architecture.md already forward-links
  here for the drafts table's canonical definition).

## Feature: CONFIG-UI — DONE
Fully discussed and written to vault-sift/features/CONFIG-UI/. Locked design summary
(authoritative version lives in the vault):
- **Naming note**: feature folder/file identifiers stay `CONFIG-UI` (preserves existing
  `[[CONFIG-UI]]` wikilinks already written into INGESTION--sources.md and elsewhere — renaming
  the identifier now would mean chasing down every cross-link for no functional gain). Display
  title in the doc itself is **"Config & UI"** per the user's naming preference, to avoid the
  "configuration of the UI" (theme/layout) misreading — this feature is the UI *used to
  configure sift*, backed by config files, not settings about the UI's own appearance.
- **Scope boundary (important, keep these two mental models separate)**: CONFIG-UI owns
  everything that controls HOW SIFT BEHAVES (user-authored, small, rarely changes). STORAGE-
  HISTORY owns everything that records WHAT HAS HAPPENED (grows over time, gets queried/pruned).
  These are deliberately two different persistence mechanisms, not one system pretending to be
  two — config lives in flat JSON files, history lives in SQLite.
- **Storage (locked)**: a `config/` folder at repo root, plain JSON files, NOT SQLite/Drizzle.
  Files: `providers.json` (list — id, label, baseUrl, apiKey, kind), `sources.json` (reuses
  INGESTION's already-speced schema exactly: name, url, category, enabled — CONFIG-UI is just
  the UI for this pre-existing schema, not a new one), `settings.json` (scalars: budgetCapUsd,
  draftsRetentionRuns [nullable = unlimited], scheduleDays, voiceProfile [single JSON object,
  not a list — {toneNotes, examplePosts[], interests[]} per DRAFT-GENERATOR--voice-profile.md]),
  and model-assignment fields (curationProviderId/curationModel/draftingProviderId/
  draftingModel) folded into settings.json rather than a separate table/file — resolved from
  the earlier "dedicated table vs KV" debate once the whole feature moved off SQLite entirely.
  **`config/` MUST be gitignored** (holds plaintext API keys) — same lesson already applied to
  `data/`. Rationale for JSON-not-SQLite: config data doesn't need SQL query power (small,
  loaded whole into memory), and keeping it physically separate from STORAGE-HISTORY's DB
  reinforces the "config vs history" conceptual split rather than blurring it.
- **Three pages (locked)**, same Next.js app as REVIEW-WORKSPACE, Server Actions only (no
  separate API route layer, matching the established pattern):
  1. **API Config** (`--api-config-page`) — providers list (add/edit/remove), per-stage model
     assignment (curation vs drafting), the "test this model" button (structured-output probe,
     per the "Minimum model capability floor" decision below).
  2. **Settings** (`--settings-page`) — sources (enable/disable/add, reusing INGESTION's
     schema), schedule (which days the pipeline runs — saving this re-registers the in-process
     `node-cron` job live via a Server Action, NOT an app restart), voice profile editor,
     drafts retention (last N runs / unlimited — STORAGE-HISTORY's pruning setting).
  3. **Costs Management** (`--costs-page`) — budget cap (writes to settings.json) PLUS cost
     history viewing (reads from STORAGE-HISTORY's `llm_calls` SQLite table via the same
     Drizzle client — a genuine read-from-one-system/write-to-another split within one page,
     worth documenting clearly in --architecture so it isn't mistaken for a CONFIG-UI-owned
     table).
  - NOTE: the "Posts" page is REVIEW-WORKSPACE, a separate already-completed feature — not
    part of CONFIG-UI despite living in the same app/navigation.
- **Security**: API keys stored plaintext in `config/providers.json`, gitignored, not
  web-served — consistent with STORAGE-HISTORY's already-locked precedent (no encryption-at-
  rest, no key-management story needed for a local single-user file). Explicit note: a leaked
  API key is an ongoing $ liability on the user's own provider account, not just leaked local
  data — flag prominently when DISTRIBUTION-TRUST's cross-cutting security posture is written.
- **Deferred as overkill**: auth, settings versioning/audit log, config import/export as a
  first-class feature, a secrets vault/KMS integration.

## Feature: SCHEDULER + regenerate design + STORAGE-HISTORY schema revision — LOCKED (2026-07-16)
This is a big, coupled change — read this section in full before touching any vault file, since
it revises INGESTION, CURATION-ENGINE, DRAFT-GENERATOR, REVIEW-WORKSPACE, and STORAGE-HISTORY,
plus writes SCHEDULER fresh and adds one piece to CONFIG-UI. Everything below supersedes any
earlier conflicting description in those features' existing vault files.

### SCHEDULER (locked)
- In-process `node-cron` inside the same long-lived Next.js server process (already established
  — not a GitHub Action). Fires the full pipeline on `scheduleDays` (from CONFIG-UI's
  settings.json).
- **Missed-run catch-up**: on app startup, check the most recent scheduled slot that should
  already have occurred (via `pipeline_runs`, see schema below). If no run exists for that slot
  AND it's within the last 24h, fire one catch-up run immediately. Older than 24h → silently
  skip, wait for the next natural slot. Reason: sift curates trending news — a multi-day-stale
  catch-up would draft posts about news that's no longer current, worse than just skipping.
- **Concurrency**: a single in-memory `isRunning` boolean in the server process, checked by
  every trigger source (cron, startup catch-up, manual "Run Now", and the two regenerate
  actions below) before starting. A trigger arriving while busy is a silent no-op (console log
  only). No DB-backed lock needed — single process, and a restart already means nothing was
  really running (matches the existing "abort entirely, no partial output, no resume"
  semantics).
- **Manual "Run Now"**: a button on CONFIG-UI's Settings page (next to the schedule config,
  distinct from the two regenerate actions below, which live on REVIEW-WORKSPACE) — triggers a
  full pipeline run (fresh ingestion through drafting) outside the schedule, using the same
  concurrency guard.
- **No auto-retry** on a failed/aborted run — wait for the next natural scheduled slot, or use
  "Run Now" once whatever broke is fixed. `budget_cap` aborts would fail again immediately
  (cap is monthly); `api_error` aborts need a human to look before retrying.

### Regenerate (new — lives on REVIEW-WORKSPACE, not Settings)
Two distinct buttons on the review page, both using the same concurrency guard as SCHEDULER:
- **Regenerate Posts** (cheap) — re-runs DRAFT-GENERATOR only, on the *same* 3 already-chosen
  candidates. New wording/phrasing for the same topics (LLM output isn't deterministic).
  Overwrites the current `posts` rows for this run (no versioning/history of prior drafts —
  already-locked "no edit-history" decision covers this).
- **Regenerate Topics** — re-runs CURATION-ENGINE on the remaining ~37 un-chosen candidates from
  the *same* run (no re-ingestion), picks a new 3, then drafts those. Replaces the current
  `posts` rows.
- Both create a new `pipeline_runs` row tagged `type: 'regenerate-posts'` or
  `type: 'regenerate-topics'` (see schema below) — explicitly NOT counted as satisfying a
  scheduled slot for missed-run detection.

### STORAGE-HISTORY schema — REVISED (supersedes the earlier 3-table design)
Final table set: `candidates`, `posts` (renamed from `drafts`), `llm_calls`, `pipeline_runs`.
`seen_items` is DROPPED — merged into `candidates` (see rationale below).

- **`pipeline_runs`**: `id, startedAt, finishedAt, status ('success'|'aborted'), abortReason
  ('budget_cap'|'api_error', nullable), type ('scheduled'|'catchup'|'manual'|
  'regenerate-posts'|'regenerate-topics')`. One row per pipeline execution of any kind. Every
  other run-scoped table links back via `runId`. Justification (this was previously asserted
  without explanation — here's the real one): (1) SCHEDULER's missed-run check queries this
  table for "was there a run for the expected slot", (2) it's the home for abort-reason logging
  that the cost-safety design already committed to but had nowhere to land before (a
  budget-cap abort happens before any LLM call, so it can't piggyback on an `llm_calls` row),
  (3) it's the anchor `candidates`/`posts`/`llm_calls` reference to know which run they belong
  to, including telling a full run apart from a regenerate action.
- **`candidates`**: `id, runId, url, sourceRecap, chosen (bool), createdAt`. ALL items INGESTION
  hands to CURATION-ENGINE (~40), not just the 3 picked — permanent, never wiped (storage size
  is trivial at this scale, so there's no real reason to delete old runs' candidates). Serves
  TWO purposes with one table: (1) **dedup** — INGESTION checks "does this URL already exist in
  `candidates`, any run, ever" instead of a separate hash table; (2) **regenerate-topics** —
  query `WHERE runId = currentRun AND chosen = false` for the remaining pool to re-curate from.
  This replaces the earlier "~40 candidates are memory-only, never persisted" decision (logged
  under "Pipeline execution model" above) — that decision is SUPERSEDED, candidates now persist
  specifically to support Regenerate Topics.
- **`posts`** (renamed from `drafts`): `id, candidateId (FK -> candidates.id), runId, url,
  originalText, editedText, imagePrompt, discarded, posted, postedAt`. The 3 candidates that
  got curated+drafted, plus drafting-specific fields. `originalText`/`editedText` are the
  *drafted post text* (a generated artifact), distinct from `candidates.sourceRecap` (the raw
  article content the draft was based on) — not a duplicate, a different kind of data.
  Display rule unchanged: `editedText ?? originalText`.
- **`llm_calls`**: unchanged from the original design — `id, timestamp, runId, provider, model,
  inputTokens, outputTokens, estimatedCost`. `runId` now has a real, always-populated target
  in `pipeline_runs` (previously spec'd as nullable/"for future use", now just a plain FK).
- **Retention**: `pipeline_runs`, `candidates`, `llm_calls` — indefinite (all trivial row/size
  counts, per the earlier STORAGE-HISTORY sizing analysis). `posts` — the only table with
  configurable N-run retention (CONFIG-UI setting), unchanged from the original design.

### Ripple effects to propagate (all supersede current vault content in these features)
- **INGESTION**: dedup now checks against `candidates` (all runs, any status) instead of a
  separate `seen_items` hash table. INGESTION writes the ~40-candidate batch directly into
  `candidates` (tagged with the current `runId`) as its handoff to CURATION-ENGINE, rather than
  passing them in-memory only.
- **CURATION-ENGINE**: reads its input pool from `candidates` (not an in-memory array), marks
  `chosen = true` on the 3 it picks. Must support being re-invoked standalone for Regenerate
  Topics (same `runId`, `WHERE chosen = false` pool, no re-ingestion).
- **DRAFT-GENERATOR**: writes to `posts` (renamed from `drafts`), each row referencing its
  `candidateId`. Must support being re-invoked standalone for Regenerate Posts (same 3
  `candidateId`s, fresh LLM call, overwrite the existing `posts` rows for this run).
- **REVIEW-WORKSPACE**: rename `drafts` -> `posts` throughout (route/UI copy can still say
  "posts" casually, that's already the natural term). Add the two Regenerate buttons described
  above to the page/card UI.
- **CONFIG-UI**: add "Run Now" button to `--settings-page`, next to `scheduleDays` — distinct
  from the two Regenerate buttons, which live on REVIEW-WORKSPACE instead.

## Feature: DISTRIBUTION-TRUST — LOCKED (2026-07-16), all open questions resolved
Fully discussed. This is the last of the 8 originally-planned features. Two components:
`--llm-cost-safety` (already named, its canonical home per earlier decisions) and
`--oss-packaging` (new). Default --security/--resilience sub-features carry the cross-cutting
safety posture (no-auth warning, secrets policy, content-safety linter, rate limiting).

### --llm-cost-safety
- Enforcement algorithm (this is the actual "how", synthesizing everything locked earlier):
  before each LLM call, compute `sum(estimatedCost from llm_calls WHERE timestamp in current
  UTC calendar month) + cost(prompt_tokens_this_call) + cost(configured max_output_tokens)`;
  if that total would exceed `budgetCapUsd`, ABORT before making the call (no partial output,
  already-locked abort semantics, log to `pipeline_runs`/`llm_calls` as already designed).
  **Critical detail that was previously missing**: the pre-call check MUST use an upper-bound
  estimate (prompt tokens + max_output_tokens), not wait for the real output token count —
  actual output tokens aren't known until after the call completes, so checking only against
  known-so-far cost would let a call complete and only be discovered as over-cap after the
  money's already spent. "Current month" = UTC calendar month specifically (matches how
  providers report usage on their own dashboards, avoids timezone ambiguity for a self-hosted
  app that could run anywhere). No concurrency race to worry about — SCHEDULER's `isRunning`
  guard already prevents overlapping pipeline runs, so no concurrent writers to `llm_calls`.
- Minimum model capability floor: documented recommendation (not enforced beyond the
  already-built CONFIG-UI test-button), roughly Llama-3-8B/GPT-3.5-turbo-class or stronger.
  Framing tightened to tie directly to the actual failure mode: "models below this tier often
  fail structured-JSON output — if the CONFIG-UI test button fails, try a stronger model."

### --oss-packaging
- **Docker as the primary/blessed path**: multi-stage build — `deps` (npm ci) -> `build`
  (`next build`, `output: 'standalone'`) -> slim `runner` on `node:22-slim` (explicitly NOT
  alpine — `better-sqlite3` is a native module and alpine's musl libc causes real
  node-gyp/compilation pain; slim avoids that at modest size cost). Runs as non-root.
  `docker-compose.yml` is the actual one-command front door (`docker compose up -d`) — one
  service, one `.env` for keys (optional, see first-run below), port mapped.
- **Paths (locked — kept SEPARATE, not consolidated)**: `SIFT_DB_PATH` (already locked,
  defaults to `data/sift.db`) and `config/` (already locked, gitignored JSON files) stay as
  two distinct paths/env vars, each its own Docker volume mount if desired — explicitly
  rejected the alternative of merging both under one `SIFT_DATA_DIR` parent directory. Pin the
  shipped compose file to a specific image version tag, not `latest`, so upgrades are
  deliberate. Consider publishing to GHCR so users can pull a prebuilt image instead of a local
  native-module compile.
- **First-run experience**: the app MUST boot successfully with zero configuration — API keys
  are entered through CONFIG-UI's API Config page after startup, never required as an env var
  at boot (this is already consistent with CONFIG-UI--resilience's locked "auto-create config/
  with sensible defaults, don't crash on missing config" behavior — this is a confirmation,
  not a new decision). Migrations auto-run on startup (already locked, idempotent). Surface the
  single reachable URL (e.g. `http://localhost:3000`) as the "you're done" signal in the
  README. `.env.example` documents every recognized var with safe defaults; `.env` is optional
  since keys can be entered entirely in-app.
- **Non-Docker path**: `npm ci && npm run build && npm start` stays a fully supported fallback
  (same `migrate()`-on-start behavior), positioned second to Docker in the README. Explicitly
  call out the native-module C-toolchain requirement for `better-sqlite3` as the #1 friction
  point for non-Docker self-hosters (especially Windows) — this is worth a prominent README
  note, not just a passing mention. No OS-specific service wrappers (systemd units etc.) — out
  of scope for a single-user tool.
- **LICENSE (locked)**: MIT. Maximally permissive, standard for a self-hosted dev tool, zero
  friction for people running/modifying it on their own machines. (AGPL was considered and
  explicitly rejected — that tradeoff, anti-SaaS-resale protection, isn't a priority here.)
- **README**: house header format (centered title/tagline/description/tech badges — already
  documented in global CLAUDE.md conventions, don't redesign it). Quick Start leads with
  `docker compose up -d`, notes the optional `.env`/in-app key entry, the single URL, the
  non-Docker fallback second, and an explicit "your data lives in the mounted volume(s), safe
  across upgrades" callout. Badges: Next.js, TypeScript, SQLite, Docker, License-MIT.
- **CONTRIBUTING.md**: local dev via the non-Docker path, the native-module build prereq, the
  Drizzle migration workflow (`drizzle-kit generate`, migrations checked into `drizzle/`, never
  hand-edit an applied migration), a "run `npm run build` before PR" check.
- **SECURITY.md (new, not previously discussed)**: a private vulnerability-disclosure contact —
  worth having specifically because sift handles users' LLM API keys and (see below) has no
  built-in auth; gives people a responsible channel instead of an open GitHub issue leaking a
  live exploit.

### Cross-cutting safety posture (--security / --resilience, default sub-features)
- **No authentication anywhere — the single most important undocumented gap, now documented.**
  This isn't a new decision, it's a direct consequence of choices already locked across
  CONFIG-UI/REVIEW-WORKSPACE (single local user, no auth, by design). If a self-hoster exposes
  sift beyond localhost (a VPS, a NAS with port-forwarding), anyone who reaches it can view or
  replace API keys via CONFIG-UI with zero barrier. README needs an explicit, prominent
  warning: only run on a trusted local network, or put your own auth/reverse-proxy in front if
  exposing it publicly.
- **Content-safety guardrail on LLM output (LOCKED — build it, user confirmed "yes")**: a
  lightweight, non-blocking regex-based leakage linter — flags drafted post text containing
  obvious prompt-injection-leakage tells ("ignore previous instructions", "as an AI language
  model", "system prompt", etc.) with a warning badge on the card in REVIEW-WORKSPACE. No LLM
  call, no abort, purely draws the eye during the review step that already exists (a human
  reads every post before copy/post — that's the real guardrail; this is a cheap assist on top,
  not a replacement). RIPPLE: REVIEW-WORKSPACE--draft-review-ui.md needs a small addition
  describing this badge.
- **Rate limiting (new, previously undesigned)**: sequential (not concurrent) fetches with a
  fixed ~500ms-1s delay between requests, plus an honest identifying `User-Agent` (naming sift
  + a repo URL) — applies to both INGESTION's source fetches and DRAFT-GENERATOR's per-article
  enrichment fetches. No token-bucket/concurrency-cap system needed at this scale (5-10
  sources, 4-5x/week). RIPPLE: light cross-reference addition to INGESTION and DRAFT-
  GENERATOR's --technologies files pointing at this as the shared fetch-etiquette policy,
  rather than each feature re-describing it.
- **Secrets handling — practical README policy** (storage itself already locked: plaintext in
  `config/providers.json`, gitignored, no encryption-at-rest — no real key-management story
  exists for a lone local file, so encryption would be theater): check `git status` before your
  first commit on a fork; if a key ever leaks, rotate it at the provider (deleting locally
  doesn't revoke it); use a sift-scoped key, not your main provider key; set a **provider-side
  spend limit** as the real hard backstop (sift's own `budgetCapUsd` is only a soft app-level
  guard that requires the app to be running and the check logic to be correct).

## Phase 3: Plan definition — LOCKED (2026-07-16)
All 8 features designed and documented; `_architecture.md` written for real (was TBD). Moving
to implementation-phase planning. 5 phases, ordered by dependency:

1. **Data Foundation** — STORAGE-HISTORY (schema/migrations, 4 tables) + CONFIG-UI's config-file
   layer (JSON read/write utilities + seed defaults, not the full UI yet).
2. **Core Pipeline** — INGESTION -> CURATION-ENGINE -> DRAFT-GENERATOR, runnable end-to-end via
   script/CLI. DISTRIBUTION-TRUST's `--llm-cost-safety` (pre-call budget check) and rate-
   limiting are built INTO this phase, not deferred — this is a deliberate decision: building
   the pipeline once without cost safety and retrofitting later is wasteful and leaves a window
   where a bug could run up real API spend uncapped.
3. **Human Interface** — REVIEW-WORKSPACE (edit/discard/copy-post + the two Regenerate actions)
   + CONFIG-UI's full 3-page UI. NOTE: the shared `isRunning` concurrency guard SCHEDULER
   canonically owns gets introduced HERE (it's trivial — a module-level boolean + a check
   function) since REVIEW-WORKSPACE's regenerate buttons need it before SCHEDULER (phase 4)
   exists. SCHEDULER later just adds more trigger sources (cron, catch-up) to the same
   already-built guard — this is an implementation-ordering detail, not a design change.
4. **Automation** — SCHEDULER (node-cron registration, 24h missed-run catch-up, manual Run Now
   wiring on CONFIG-UI's Settings page).
5. **Safety & Distribution** — DISTRIBUTION-TRUST's `--oss-packaging` only (Docker, compose,
   README, LICENSE, CONTRIBUTING, SECURITY.md) — the safety half already landed in phase 2.

## Phase 1 review — provider deletion guard (locked 2026-07-16)
Found during Phase 1 review: nothing in CONFIG-UI's docs covered what happens if a provider
currently assigned to `curationProviderId`/`draftingProviderId` (in `settings.json`) gets
deleted from `providers.json` — since these are separate JSON files, nothing enforced that
reference. **Locked: block deletion.** If a provider's `id` matches either assignment field,
the delete action on the API Config page refuses with a clear message (reassign the stage to a
different provider first). Matches the project's established "fail loudly / catch mistakes at
the moment they're made" pattern rather than letting a dangling reference surface later as a
run-time failure. RIPPLE: CONFIG-UI--api-config-page.md (the delete action) and
CONFIG-UI--resilience.md (add as a new failure-mode entry, same shape as its existing ones).

## DEFERRED — provider catalog UX (Phase 3, not yet locked)
Raised during Phase 1 review, explicitly deferred to a later discussion (does not block Phase 1
— no schema change involved). Direction: a curated catalog picker in CONFIG-UI's API Config
page (pre-fills baseUrl/kind for known providers: NVIDIA NIM, OpenRouter, Gemini, DeepSeek,
Mistral, Mistral Codestral, OpenCode Zen/Go, Wafer, Kimi, Cerebras, Groq, Fireworks, Z.ai
[flagged not essential for v1], plus local endpoints LM Studio/llama.cpp/Ollama with a
reachability "Test" instead of a key), a "Refresh models" live call to `{baseUrl}/models` to
populate a real model dropdown instead of free-typing, and status badges (Configured/Missing
key/Offline/Reachable) derived from existing data — no new providers.json/settings.json fields
needed for any of this. Open question to resolve later: full catalog now vs. a trimmed starter
set (NVIDIA NIM/OpenRouter/DeepSeek/Gemini + the 3 local ones). One clarification already
locked regardless of catalog scope: `curationModel`/`draftingModel` store the RAW model string
as that specific provider's own API expects it (e.g. `moonshotai/kimi-k2.6` for NVIDIA NIM),
NOT prefixed with a provider name (`nvidia_nim/...`) — sift already disambiguates provider via
`curationProviderId`/`draftingProviderId` separately, so a prefixed string would be sent
verbatim to the provider's API as an invalid model name.

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
