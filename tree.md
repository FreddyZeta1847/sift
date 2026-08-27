.
├── .docker-smoketest-data;C/
├── .impeccable/
│   ├── config.json
│   ├── design.json
│   └── hook.cache.json
├── app/
│   ├── admin/
│   │   ├── candidates/
│   │   │   ├── CandidatesTable.tsx
│   │   │   └── page.tsx
│   │   ├── llm-calls/
│   │   │   ├── LlmCallsTable.tsx
│   │   │   └── page.tsx
│   │   ├── posts/
│   │   │   ├── page.tsx
│   │   │   └── PostsTable.tsx
│   │   ├── actions.test.ts
│   │   ├── actions.ts
│   │   ├── AdminNav.tsx
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── RunsTable.tsx
│   ├── api/
│   ├── config/
│   │   ├── api/
│   │   │   ├── actions.test.ts
│   │   │   ├── actions.ts
│   │   │   ├── ApiConfigForm.tsx
│   │   │   ├── ModelSelect.tsx
│   │   │   ├── ModelsTable.tsx
│   │   │   └── page.tsx
│   │   ├── costs/
│   │   │   ├── actions.test.ts
│   │   │   ├── actions.ts
│   │   │   ├── CostsForm.tsx
│   │   │   └── page.tsx
│   │   └── settings/
│   │       ├── actions.test.ts
│   │       ├── actions.ts
│   │       ├── model-check-actions.test.ts
│   │       ├── page.tsx
│   │       └── SettingsForm.tsx
│   ├── health/
│   │   ├── actions.test.ts
│   │   ├── actions.ts
│   │   ├── ModelCheckGate.tsx
│   │   ├── ModelHealthBanner.tsx
│   │   └── ModelHealthProvider.tsx
│   ├── posted/
│   │   ├── page.tsx
│   │   └── PostedList.tsx
│   ├── review/
│   │   ├── actions.test.ts
│   │   ├── actions.ts
│   │   ├── DraftCard.tsx
│   │   ├── page.tsx
│   │   └── RunPicker.tsx
│   ├── globals.css
│   ├── icon.svg
│   ├── layout.tsx
│   ├── Nav.tsx
│   └── page.tsx
├── bin/
│   └── sift-server.js
├── docs/
│   └── superpowers/
│       └── plans/
│           ├── 2026-07-16-phase-1-data-foundation.md
│           ├── 2026-07-17-phase-2-core-pipeline.md
│           ├── 2026-07-18-phase-3-human-interface.md
│           └── 2026-07-19-phase-4-automation.md
├── drizzle/
│   ├── meta/
│   │   ├── 0000_snapshot.json
│   │   ├── 0001_snapshot.json
│   │   ├── 0002_snapshot.json
│   │   ├── 0003_snapshot.json
│   │   ├── 0004_snapshot.json
│   │   ├── 0005_snapshot.json
│   │   ├── 0006_snapshot.json
│   │   ├── 0007_snapshot.json
│   │   └── _journal.json
│   ├── 0000_equal_gladiator.sql
│   ├── 0001_bumpy_wendell_rand.sql
│   ├── 0002_unknown_king_cobra.sql
│   ├── 0003_add_post_title.sql
│   ├── 0004_add-sources-table.sql
│   ├── 0005_add-current-stage.sql
│   ├── 0006_youthful_wallow.sql
│   └── 0007_motionless_roxanne_simpson.sql
├── lib/
│   ├── admin/
│   │   ├── delete.test.ts
│   │   ├── delete.ts
│   │   ├── queries.test.ts
│   │   └── queries.ts
│   ├── candidates/
│   │   ├── backfill-source.test.ts
│   │   ├── backfill-source.ts
│   │   ├── retention.test.ts
│   │   └── retention.ts
│   ├── config/
│   │   ├── cost-history.test.ts
│   │   ├── cost-history.ts
│   │   ├── known-providers.test.ts
│   │   ├── known-providers.ts
│   │   ├── models.ts
│   │   ├── providers.test.ts
│   │   ├── providers.ts
│   │   ├── read-config.test.ts
│   │   ├── read-config.ts
│   │   ├── safe-write.ts
│   │   ├── seed-sources.ts
│   │   ├── settings.test.ts
│   │   ├── settings.ts
│   │   ├── sources.test.ts
│   │   ├── sources.ts
│   │   ├── test-model-probe.test.ts
│   │   ├── test-model-probe.ts
│   │   └── types.ts
│   ├── curation/
│   │   ├── run.test.ts
│   │   └── run.ts
│   ├── db/
│   │   ├── client.test.ts
│   │   ├── client.ts
│   │   ├── migrate.test.ts
│   │   ├── migrate.ts
│   │   ├── schema.test.ts
│   │   ├── schema.ts
│   │   ├── sources.test.ts
│   │   └── sources.ts
│   ├── draft/
│   │   ├── enrich.test.ts
│   │   ├── enrich.ts
│   │   ├── generate.test.ts
│   │   ├── generate.ts
│   │   ├── regenerate.test.ts
│   │   ├── regenerate.ts
│   │   ├── run.test.ts
│   │   ├── run.ts
│   │   ├── safe-fetch.test.ts
│   │   ├── safe-fetch.ts
│   │   ├── ssrf-guard.test.ts
│   │   └── ssrf-guard.ts
│   ├── health/
│   │   ├── check-models.test.ts
│   │   ├── check-models.ts
│   │   ├── model-health.test.ts
│   │   ├── model-health.ts
│   │   └── types.ts
│   ├── ingestion/
│   │   ├── fetch.test.ts
│   │   ├── fetch.ts
│   │   ├── normalize.test.ts
│   │   ├── normalize.ts
│   │   ├── rate-limit.ts
│   │   ├── run.test.ts
│   │   └── run.ts
│   ├── llm/
│   │   ├── cost-safety.test.ts
│   │   ├── cost-safety.ts
│   │   ├── json-repair.test.ts
│   │   ├── json-repair.ts
│   │   ├── non-pipeline-calls.test.ts
│   │   ├── non-pipeline-calls.ts
│   │   ├── pricing.test.ts
│   │   ├── pricing.ts
│   │   ├── provider.test.ts
│   │   └── provider.ts
│   ├── pipeline/
│   │   ├── run-guard.test.ts
│   │   └── run-guard.ts
│   ├── posts/
│   │   ├── retention.test.ts
│   │   └── retention.ts
│   ├── review/
│   │   ├── queries.test.ts
│   │   └── queries.ts
│   ├── safety/
│   │   ├── leakage-linter.test.ts
│   │   └── leakage-linter.ts
│   ├── scheduler/
│   │   ├── catchup.test.ts
│   │   ├── catchup.ts
│   │   ├── cron.test.ts
│   │   ├── cron.ts
│   │   ├── init.test.ts
│   │   ├── init.ts
│   │   ├── trigger.test.ts
│   │   └── trigger.ts
│   └── translation/
│       ├── actions.test.ts
│       ├── actions.ts
│       ├── models.test.ts
│       ├── models.ts
│       ├── protocol.ts
│       ├── translate.test.ts
│       ├── translate.ts
│       ├── tsconfig.worker.json
│       ├── worker.test.ts
│       └── worker.ts
├── scripts/
│   ├── regenerate-posts.test.ts
│   ├── regenerate-posts.ts
│   ├── run-pipeline.test.ts
│   ├── run-pipeline.ts
│   ├── view-candidates.test.ts
│   ├── view-candidates.ts
│   ├── view-posts.test.ts
│   ├── view-posts.ts
│   ├── view-runs.test.ts
│   └── view-runs.ts
├── .dockerignore
├── .env.example
├── .gitignore
├── CLAUDE.md
├── CONTRIBUTING.md
├── DESIGN.md
├── docker-compose.yml
├── Dockerfile
├── drizzle.config.ts
├── instrumentation.test.ts
├── instrumentation.ts
├── LICENSE
├── next.config.ts
├── package-lock.json
├── package.json
├── PRODUCT.md
├── PROGRESS.md
├── README.md
├── SECURITY.md
├── tree.md
├── tsconfig.json
├── tsconfig.tsbuildinfo
└── vitest.config.ts
