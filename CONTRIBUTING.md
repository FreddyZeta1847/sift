# Contributing to sift

## Local development

```bash
npm ci
npm run build   # sanity check — see below
npm run dev
```

`npm run dev` starts the app at `http://localhost:3000` with hot reload. If
you'd rather not `cd` into the repo every time, `npm link` (or
`npm install -g .`) once registers a global `sift-server` command that does
the same thing from any directory — see `bin/sift-server.js`.

### The native-module build prerequisite

`better-sqlite3` is a native Node addon — `npm ci`/`npm install` either
downloads a prebuilt binary for your platform or, if none matches, compiles
it from source using `node-gyp`, which needs Python and a C++ compiler
already installed. This is the most common source of a broken first install,
**especially on Windows**, where that toolchain (Visual Studio Build Tools)
isn't present by default. If `npm ci` fails with a `node-gyp`/MSVC error,
that's what's happening — install the
[windows-build-tools](https://github.com/nodejs/node-gyp#on-windows) (or
Visual Studio's "Desktop development with C++" workload) and retry.

## Database migrations

Schema changes go through Drizzle's migration generator, not hand-written
SQL:

```bash
npm run db:generate   # after editing lib/db/schema.ts
```

This produces a new migration file under `drizzle/`, which gets checked into
the repo. **Never hand-edit a migration file that's already been committed**
— sift ships to other people's already-running databases (via `instrumentation.ts`,
which runs `runMigrations()` on every server startup); editing an applied
migration in place means their database silently diverges from a fresh
install's. If a migration needs fixing, ship a new migration, not a rewrite
of an old one.

## Before opening a PR

```bash
npm test            # full vitest suite
npx tsc --noEmit    # typecheck
npm run build       # must pass — this is what Docker and `npm start` both run
```

This project also follows test-driven development in its own history (see
the `.test.ts` file next to nearly every source file) — new logic should
come with tests, not just the happy-path manual check.

## Code style

- Every source file starts with a header comment describing what it does —
  see any existing file (e.g. `lib/db/migrate.ts`) for the expected length
  and level of detail.
- Prefer several small, focused functions over one long one.
- Don't add abstractions, config flags, or error handling for scenarios that
  can't actually happen in this codebase — see existing modules for the
  level of defensiveness that's actually warranted here.
