# Changelog

All notable changes to sift are recorded here. Versions follow
[semantic versioning](https://semver.org/).

## [1.1.0] — 2026-08-27

The theme of this release is **telling you the truth about your models and what
they cost**. Three things were quietly wrong, and each was invisible in a
different way.

### Fixed

- **The app would not load while a scheduled run was due.** Opening
  `localhost:3000` hung until the whole pipeline finished — minutes of
  ingestion and drafting — with no page, no error, and no spinner. Next.js
  awaits `instrumentation.ts`'s `register()` before serving any request, and
  the startup catch-up run was on that path. The run now starts at boot but is
  never awaited, so the app renders immediately and the run appears in the
  sidebar exactly like a manual one.

- **"Timeout" and "unreachable" meant each other's things.** The model probe
  reported `timeout` when *its own* budget elapsed, and `unreachable` when the
  provider genuinely timed out — exactly backwards, so neither word could be
  acted on. A model that was merely slow got reported as broken.

- **Spend was invisible for most models.** Prices lived in a hard-coded list of
  four models, and anything absent from it cost $0. A self-hoster running
  Gemini saw $0.00 on the Costs page and a monthly budget cap that could never
  fire, with nothing anywhere saying why.

### Added

- **Startup model check.** Both assigned models are checked when the server
  starts. The app stays usable throughout — only "Run Now" and the model tests
  are held, and never for more than 60 seconds. A result banner follows, in
  four tones: a real failure is red, and a model sift simply stopped waiting
  for is grey and explicitly *not* a failure.

- **Ollama and LM Studio** as default providers, needing no API key — a blank
  key on a local provider no longer shows a warning it deserved on a hosted one.

- **Model listing.** "Fetch available models" asks a provider what it offers,
  for every default provider: `GET {baseUrl}/models` for the OpenAI-compatible
  ones, the SDK's own listing for Anthropic. A mistyped model name used to be
  indistinguishable from a broken one — the provider returns 404, the probe
  says "unreachable", and that reads as a bad API key.

- **Models & pricing.** The models you use and what each costs per million
  tokens, owned by you rather than hard-coded. It doubles as the source for the
  model dropdowns, and it is what the Costs page and the budget cap work from.
  A model with no row is labelled **"pricing not set"** rather than $0.00 —
  unpriced is not free.

- **Cost recording for checks and probes.** The "Test this model" button and
  the startup check are real, billable calls that previously left no trace.
  They are now recorded and counted against the budget cap, and shown
  separately from pipeline spend.

- **Model-checking settings.** An off switch for the startup check, and sliders
  for the three time limits — including the provider's allowance during a real
  run, which was a fixed 180s and, with 3 retries, meant a dead provider cost
  over nine minutes before a run gave up.

### Changed

- **Model names are chosen, not typed.** Both stage fields are dropdowns fed by
  your model list. An assignment made before this release is preserved and
  flagged rather than silently cleared.

- **Adding and editing happen in an overlay card.** Every list used to grow its
  form in place, shifting the page and squeezing four fields into a row's
  width. Providers, models and sources now share one card, opened from a
  labelled button beside each heading instead of a bare "+" below the list.

### Internal

- `SIFT_DIST_DIR` sends verification builds to their own directory. Running
  `next build` beside a live `next dev` corrupts the dev server's `.next/` and
  makes it serve 500s, with an error that names no cause.

## [0.1.0]

Initial release: the ingestion → curation → drafting → review pipeline, the
scheduler, the three-page config app, translation, and Docker packaging.
