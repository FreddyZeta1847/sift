# 001 — Concurrent pipeline runs raced each other; a stuck run masked a successful one

**Type:** architecture fragility, exposed by a UI relocation (not a direct code regression)
**Project where found:** sift
**Cost:** moderate — required correlating dev-server logs, DB row timestamps, and re-reading three modules (`lib/pipeline/run-guard.ts`, `scripts/run-pipeline.ts`, `lib/llm/provider.ts`) to reconstruct the sequence.

## What happened

After moving the "Run Now" trigger from the Settings page into the global top nav (so it's reachable from every route), the user reported: (1) the Review page said "This run produced no posts" for today, despite the terminal log showing curation chose 3 topics, and (2) a follow-up run's ingestion count looked suspiciously low.

DB inspection showed two `pipeline_runs` rows for the same day: run 7 (`status: "success"`, 3 posts, curation chose 3 arXiv URLs) and run 8 (`status: null`, `finishedAt: null`, 0 posts, curation log claiming the *same* 3 URLs). Run 8 never updated across several minutes of wall-clock time — permanently stuck. `resolveRunIdForDate` (`lib/review/queries.ts`) picked "most recent run for the date" with no regard for whether it finished, so the stuck run 8 masked run 7's real posts.

## Root cause (three compounding factors)

1. **No timeout anywhere on the LLM fetch call.** `lib/llm/provider.ts`'s `callOpenAICompatible` called `fetch()` with no `AbortController`/timeout, unlike `lib/draft/safe-fetch.ts`'s article-fetch path which already had this pattern. `DRAFT-GENERATOR--resilience.md` already documented "API error/timeout" as the hard-failure path for a stuck LLM call — the vault assumed a timeout existed; the code never actually implemented one. A hung `fetch` means `runPipeline`'s try/catch never resolves either way, so the `pipeline_runs` row never reaches `success`/`aborted`, and the in-memory run-guard (`lib/pipeline/run-guard.ts`'s `isRunning` boolean) never clears — permanently blocking every future Run Now/Regenerate until server restart.
2. **`Nav.tsx` used plain `<a href>` for internal navigation** (pre-existing, not introduced by this session) — every nav click causes a full page reload, remounting the whole component tree. Once "Run Now" became global, this meant clicking away from the page mid-run (impatience, checking another tab) reset the *client-side* `isRunning` (React `useTransition`) back to `false`, making the button look clickable again even though a run was still executing server-side.
3. **The server-side guard didn't hold across the second click regardless.** Best working theory: Next.js dev-mode's per-route Server Action bundling can give a freshly-compiled route its own module instance of a shared singleton (`lib/pipeline/run-guard.ts`'s module-level `let isRunning`), rather than reusing the one true instance — not fully proven, but consistent with the second run reaching `runPipeline()` at all (the `checkAndSetRunning()` gate sits *before* that call and returns `false` if it's working). Not something practically fixable without deeper Next.js internals digging; mitigated instead by removing the trigger (full-page reloads) that makes it reachable.

## Fix applied

- `app/Nav.tsx`: switched internal links from `<a href>` to `next/link`'s `Link`, so navigation no longer remounts the component or resets in-flight transition state.
- `lib/llm/provider.ts`: added a 90s `AbortController` timeout to the OpenAI-compatible fetch path (mirroring `safe-fetch.ts`'s existing pattern) and a `timeout` option on the Anthropic SDK client, so a hung call now reliably rejects instead of hanging forever — closing the gap between `DRAFT-GENERATOR--resilience.md`'s documented intent and the actual implementation.
- `lib/review/queries.ts`: `resolveRunIdForDate` now prefers the latest run with `status: "success"` over a later still-running/aborted one for the same date, falling back to the plain latest run only if none succeeded — so a stuck/failed run can never again hide an earlier real one.
- Restarted the dev server to clear the already-stuck `isRunning` flag and orphaned run.

## Lesson for future projects

An in-memory singleton lock (`let isRunning = false` at module scope) is fragile across two axes that don't show up in a quick read of the file: (a) it has no protection against the guarded operation itself hanging forever (always pair a mutex/lock with a timeout on whatever it's guarding), and (b) it silently assumes the module is a true process-wide singleton, which is not guaranteed under a dev server's hot-reload/route-bundling behavior. If a feature that triggers the guarded action moves from a page-scoped UI element to a persistent/global one (e.g. a page-local button becomes a nav-bar button), re-examine what UI-level double-invocation protection you were implicitly relying on — it may have only worked by accident of where the button used to live.
