# Phase 1 — Data Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up sift's two foundational persistence layers — the SQLite/Drizzle schema (via Storage/History) and the JSON config-file layer (via Config & UI) — with nothing else built on top yet (no pipeline logic, no LLM calls, no UI pages).

**Architecture:** A single Next.js (App Router, TypeScript) project at the repo root. `lib/db/` holds the Drizzle schema, client, and migration bootstrap backed by `better-sqlite3`. `lib/config/` holds a generic JSON read/write utility plus thin typed wrappers for `providers.json`/`sources.json`/`settings.json`. Both layers are library code only in this phase — later phases (2: pipeline scripts, 3: Next.js pages) import from `lib/db` and `lib/config` rather than duplicating logic.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Drizzle ORM + `better-sqlite3`, Vitest for tests, Node's built-in `fs`/`fs/promises` for config files.

## Global Constraints

- One `npm install` for the whole project — no separate packages/workspaces (per `current-task.md`'s locked "Tech stack" cross-cutting decision).
- SQLite DB path is configurable via `SIFT_DB_PATH`, default `data/sift.db` (per `STORAGE-HISTORY--architecture.md`).
- `data/` and `config/` are both gitignored (already true in this repo's `.gitignore` — verify, don't re-add if present).
- Migration failures must fail loudly and refuse to start — never serve against a partially-migrated schema (per `STORAGE-HISTORY--resilience.md`).
- Malformed JSON in a config file must fail loudly, naming the file — never silently fall back to defaults for a corrupt (as opposed to missing) file (per `CONFIG-UI--resilience.md`).
- Missing `config/`/`data/` on first run auto-creates with sensible defaults rather than crashing (per `CONFIG-UI--resilience.md` and `STORAGE-HISTORY--resilience.md`).
- Never hand-edit an applied Drizzle migration file — schema changes always go through `drizzle-kit generate` (per `STORAGE-HISTORY--technologies.md`).

---

### Task 1: Initialize the Next.js + TypeScript project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `vitest.config.ts`
- Modify: `.gitignore` (verify `node_modules/`, `.next/` are present; add if missing)
- Test: none (scaffolding task — verified by build success, see Step 6)

**Interfaces:**
- Produces: a working Next.js project (`npm run build` succeeds), a working test runner (`npm test` runs, exits 0 with zero tests), TypeScript strict mode enabled for all later tasks to build on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "sift",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx lib/db/migrate.ts"
  },
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "better-sqlite3": "^11.8.1",
    "drizzle-orm": "^0.38.4"
  },
  "devDependencies": {
    "typescript": "^5.7.3",
    "@types/node": "^22.10.7",
    "@types/react": "^19.0.7",
    "@types/react-dom": "^19.0.3",
    "@types/better-sqlite3": "^7.6.12",
    "drizzle-kit": "^0.30.2",
    "vitest": "^3.0.4",
    "tsx": "^4.19.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: installs cleanly, creates `package-lock.json` and `node_modules/`.

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Write `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

(`output: "standalone"` is required for Phase 5's Docker multi-stage build, per `DISTRIBUTION-TRUST--oss-packaging.md` — set now so it's never forgotten later.)

- [ ] **Step 5: Write minimal `app/layout.tsx` and `app/page.tsx`**

`app/layout.tsx`:
```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`app/page.tsx`:
```tsx
export default function Home() {
  return <p>sift</p>;
}
```

- [ ] **Step 6: Verify the project builds**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors, produces a `.next/` directory.

- [ ] **Step 7: Write `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 8: Verify the test runner works with zero tests**

Run: `npm test`
Expected: Vitest runs and reports "no test files found" (or similar) with exit code 0 — confirms the runner itself is wired correctly before Task 2 adds real tests.

- [ ] **Step 9: Verify `.gitignore` covers Next.js/Node artifacts**

Read `.gitignore`. Ensure it contains `node_modules/` and a `.next/` entry (append `.next/` if missing — the existing file already has `node_modules/` from earlier project setup, per prior session history).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts app/ vitest.config.ts .gitignore
git commit -m "chore: scaffold Next.js + TypeScript project"
```

---

### Task 2: Drizzle + better-sqlite3 client setup

**Files:**
- Create: `lib/db/client.ts`
- Create: `drizzle.config.ts`
- Test: `lib/db/client.test.ts`

**Interfaces:**
- Consumes: Task 1's TypeScript project.
- Produces: `getDbPath(): string`, `getDb(): BetterSQLite3Database` — both exported from `lib/db/client.ts`. Task 3/4/5/6 and every later phase import `getDb()` to get a ready-to-use Drizzle instance.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/db/client.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getDbPath, getDb } from "./client";

describe("getDbPath", () => {
  const originalEnv = process.env.SIFT_DB_PATH;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SIFT_DB_PATH;
    } else {
      process.env.SIFT_DB_PATH = originalEnv;
    }
  });

  it("defaults to data/sift.db when SIFT_DB_PATH is unset", () => {
    delete process.env.SIFT_DB_PATH;
    expect(getDbPath()).toBe("data/sift.db");
  });

  it("uses SIFT_DB_PATH when set", () => {
    process.env.SIFT_DB_PATH = "custom/path.db";
    expect(getDbPath()).toBe("custom/path.db");
  });
});

describe("getDb", () => {
  const testDbPath = "data/test-client.db";

  beforeEach(() => {
    process.env.SIFT_DB_PATH = testDbPath;
  });

  afterEach(() => {
    delete process.env.SIFT_DB_PATH;
    if (existsSync(testDbPath)) rmSync(testDbPath);
  });

  it("creates the data/ directory and a .db file if missing", () => {
    getDb();
    expect(existsSync(testDbPath)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/db/client.test.ts`
Expected: FAIL — `Cannot find module './client'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/db/client.ts
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

let dbInstance: BetterSQLite3Database | null = null;

export function getDbPath(): string {
  return process.env.SIFT_DB_PATH ?? "data/sift.db";
}

export function getDb(): BetterSQLite3Database {
  if (dbInstance) return dbInstance;

  const dbPath = getDbPath();
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  dbInstance = drizzle(sqlite);
  return dbInstance;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/db/client.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write `drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.SIFT_DB_PATH ?? "data/sift.db",
  },
});
```

(References `./lib/db/schema.ts`, which doesn't exist until Task 3 — this file is inert until then, `drizzle-kit generate` isn't run until Task 4.)

- [ ] **Step 6: Commit**

```bash
git add lib/db/client.ts lib/db/client.test.ts drizzle.config.ts
git commit -m "feat: add Drizzle + better-sqlite3 client singleton"
```

---

### Task 3: Define all 4 table schemas

**Files:**
- Create: `lib/db/schema.ts`
- Test: `lib/db/schema.test.ts`

**Interfaces:**
- Consumes: nothing runtime (pure schema definitions using `drizzle-orm/sqlite-core`).
- Produces: `pipelineRunsTable`, `candidatesTable`, `postsTable`, `llmCallsTable` — named exports from `lib/db/schema.ts`. Every later phase's pipeline/UI code imports these table objects to build queries.

- [ ] **Step 1: Write the failing test**

This test verifies column presence/types by inspecting each table's Drizzle column config (not a DB round-trip — that's covered in Task 4 once migrations exist).

```typescript
// lib/db/schema.test.ts
import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable } from "./schema";

describe("pipelineRunsTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(pipelineRunsTable));
    expect(columns).toEqual(
      expect.arrayContaining(["id", "startedAt", "finishedAt", "status", "abortReason", "type"])
    );
  });
});

describe("candidatesTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(candidatesTable));
    expect(columns).toEqual(
      expect.arrayContaining(["id", "runId", "url", "sourceRecap", "chosen", "createdAt"])
    );
  });
});

describe("postsTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(postsTable));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "candidateId",
        "runId",
        "url",
        "originalText",
        "editedText",
        "imagePrompt",
        "discarded",
        "posted",
        "postedAt",
      ])
    );
  });
});

describe("llmCallsTable", () => {
  it("has the expected columns", () => {
    const columns = Object.keys(getTableColumns(llmCallsTable));
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "timestamp",
        "runId",
        "provider",
        "model",
        "inputTokens",
        "outputTokens",
        "estimatedCost",
      ])
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/db/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/db/schema.ts
import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

export const pipelineRunsTable = sqliteTable("pipeline_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status", { enum: ["success", "aborted"] }),
  abortReason: text("abort_reason", { enum: ["budget_cap", "api_error"] }),
  type: text("type", {
    enum: ["scheduled", "catchup", "manual", "regenerate-posts", "regenerate-topics"],
  }).notNull(),
});

export const candidatesTable = sqliteTable("candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => pipelineRunsTable.id),
  url: text("url").notNull(),
  sourceRecap: text("source_recap").notNull(),
  chosen: integer("chosen", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const postsTable = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  candidateId: integer("candidate_id")
    .notNull()
    .references(() => candidatesTable.id),
  runId: integer("run_id")
    .notNull()
    .references(() => pipelineRunsTable.id),
  url: text("url").notNull(),
  originalText: text("original_text").notNull(),
  editedText: text("edited_text"),
  imagePrompt: text("image_prompt").notNull(),
  discarded: integer("discarded", { mode: "boolean" }).notNull().default(false),
  posted: integer("posted", { mode: "boolean" }).notNull().default(false),
  postedAt: integer("posted_at", { mode: "timestamp" }),
});

export const llmCallsTable = sqliteTable("llm_calls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  runId: integer("run_id")
    .notNull()
    .references(() => pipelineRunsTable.id),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  estimatedCost: real("estimated_cost").notNull(),
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/db/schema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/db/schema.ts lib/db/schema.test.ts
git commit -m "feat: define pipeline_runs, candidates, posts, llm_calls table schemas"
```

---

### Task 4: Migration generation + fail-loud bootstrap

**Files:**
- Create: `lib/db/migrate.ts`
- Modify: `.gitignore` (add `data/` if not already present — check first, this repo already gitignores `data/` from prior session history)
- Test: `lib/db/migrate.test.ts`

**Interfaces:**
- Consumes: `getDb()`, `getDbPath()` from `lib/db/client.ts` (Task 2); `pipelineRunsTable`, `candidatesTable`, `postsTable`, `llmCallsTable` from `lib/db/schema.ts` (Task 3).
- Produces: `runMigrations(): void` — exported from `lib/db/migrate.ts`. Phase 2's CLI scripts and Phase 3's Next.js server startup both call this once before touching the database.

- [ ] **Step 1: Generate the migration SQL**

Run: `npm run db:generate`
Expected: creates `drizzle/0000_<random-name>.sql` containing `CREATE TABLE` statements for all 4 tables, plus a `drizzle/meta/` folder with snapshot/journal files. Inspect the generated SQL file to confirm all 4 `CREATE TABLE` statements are present with the expected columns.

- [ ] **Step 2: Write the failing test**

```typescript
// lib/db/migrate.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { existsSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate";

describe("runMigrations", () => {
  const testDbPath = "data/test-migrate.db";

  afterEach(() => {
    delete process.env.SIFT_DB_PATH;
    vi.resetModules();
    if (existsSync(testDbPath)) rmSync(testDbPath);
    if (existsSync(`${testDbPath}-wal`)) rmSync(`${testDbPath}-wal`);
    if (existsSync(`${testDbPath}-shm`)) rmSync(`${testDbPath}-shm`);
  });

  it("creates all 4 tables against a fresh database", () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();

    const sqlite = new Database(testDbPath);
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toEqual(
      expect.arrayContaining(["pipeline_runs", "candidates", "posts", "llm_calls"])
    );
    sqlite.close();
  });

  it("is idempotent — running twice does not throw", () => {
    process.env.SIFT_DB_PATH = testDbPath;
    runMigrations();
    expect(() => runMigrations()).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/db/migrate.test.ts`
Expected: FAIL — `Cannot find module './migrate'`.

- [ ] **Step 4: Write minimal implementation**

```typescript
// lib/db/migrate.ts
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getDb } from "./client";

export function runMigrations(): void {
  try {
    migrate(getDb(), { migrationsFolder: "./drizzle" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[sift] Database migration failed — refusing to start.", err);
    process.exit(1);
  }
}

// Allow `npm run db:migrate` to invoke this directly.
if (process.argv[1]?.endsWith("migrate.ts")) {
  runMigrations();
  // eslint-disable-next-line no-console
  console.log(`[sift] Migrations applied to ${process.env.SIFT_DB_PATH ?? "data/sift.db"}`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/db/migrate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Verify the fail-loud behavior manually**

Run: `SIFT_DB_PATH=/root/no-permission/sift.db npm run db:migrate` (or another path guaranteed to fail — on Windows, use a path with an invalid character, e.g. `SIFT_DB_PATH="data/te:st.db"`)
Expected: process exits non-zero, prints `[sift] Database migration failed — refusing to start.` — confirms the fail-loud path actually terminates rather than continuing silently.

- [ ] **Step 7: Verify `.gitignore` covers `data/`**

Read `.gitignore` — confirm `data/` is present (already added in a prior session per `current-task.md`). No action needed if present.

- [ ] **Step 8: Commit**

```bash
git add drizzle/ lib/db/migrate.ts lib/db/migrate.test.ts
git commit -m "feat: add migration bootstrap with fail-loud behavior"
```

---

### Task 5: Generic config file read/write utility

**Files:**
- Create: `lib/config/read-config.ts`
- Test: `lib/config/read-config.test.ts`

**Interfaces:**
- Consumes: nothing beyond Node's `fs/promises`.
- Produces: `readConfig<T>(filename: string, defaults: T): Promise<T>` — exported from `lib/config/read-config.ts`. Task 6 wraps this per-file; Phase 2/3 code never calls `fs` directly for config, always through this function or Task 6's typed wrappers.

- [ ] **Step 1: Write the failing test**

```typescript
// lib/config/read-config.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { readConfig } from "./read-config";

const testDir = "config-test";

describe("readConfig", () => {
  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("creates the file with defaults if it doesn't exist", async () => {
    mkdirSync(testDir, { recursive: true });
    const defaults = { foo: "bar" };

    const result = await readConfig(`${testDir}/missing.json`, defaults);

    expect(result).toEqual(defaults);
    expect(existsSync(`${testDir}/missing.json`)).toBe(true);
  });

  it("returns the parsed content if the file exists", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/existing.json`, JSON.stringify({ foo: "baz" }));

    const result = await readConfig(`${testDir}/existing.json`, { foo: "bar" });

    expect(result).toEqual({ foo: "baz" });
  });

  it("throws a clear error on malformed JSON, naming the file", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/corrupt.json`, "{ not valid json");

    await expect(readConfig(`${testDir}/corrupt.json`, {})).rejects.toThrow(
      /corrupt\.json/
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/config/read-config.test.ts`
Expected: FAIL — `Cannot find module './read-config'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// lib/config/read-config.ts
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export async function readConfig<T>(filePath: string, defaults: T): Promise<T> {
  if (!existsSync(filePath)) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, JSON.stringify(defaults, null, 2));
    return defaults;
  }

  const raw = await readFile(filePath, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `Malformed JSON in ${filePath}: ${(err as Error).message}`
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/config/read-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/config/read-config.ts lib/config/read-config.test.ts
git commit -m "feat: add generic config file read/write utility with fail-loud parsing"
```

---

### Task 6: Wire providers.json, sources.json, settings.json

**Files:**
- Create: `lib/config/types.ts`
- Create: `lib/config/seed-sources.ts`
- Create: `lib/config/providers.ts`
- Create: `lib/config/sources.ts`
- Create: `lib/config/settings.ts`
- Modify: `.gitignore` (add `config/` if not already present — already added in a prior session per `current-task.md`)
- Test: `lib/config/providers.test.ts`, `lib/config/sources.test.ts`, `lib/config/settings.test.ts`

**Interfaces:**
- Consumes: `readConfig<T>` from `lib/config/read-config.ts` (Task 5).
- Produces: `getProviders(): Promise<Provider[]>`, `getSources(): Promise<Source[]>`, `getSettings(): Promise<Settings>` — exported from their respective files. Phase 2's pipeline code and Phase 3's UI pages both call these instead of touching `config/*.json` directly.

- [ ] **Step 1: Write `lib/config/types.ts`**

```typescript
// lib/config/types.ts
export interface Provider {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  kind: "openai-compatible" | "anthropic";
}

export interface Source {
  name: string;
  url: string;
  category: string;
  enabled: boolean;
}

export interface VoiceProfile {
  toneNotes: string;
  examplePosts: string[];
  interests: string[];
}

export interface Settings {
  budgetCapUsd: number | null;
  postsRetentionRuns: number | null;
  scheduleDays: string[];
  voiceProfile: VoiceProfile;
  curationProviderId: string | null;
  curationModel: string | null;
  draftingProviderId: string | null;
  draftingModel: string | null;
}
```

- [ ] **Step 2: Write `lib/config/seed-sources.ts`**

Starter list per `INGESTION--sources.md`, locked for v1:

```typescript
// lib/config/seed-sources.ts
import type { Source } from "./types";

export const SEED_SOURCES: Source[] = [
  { name: "arXiv cs.AI", url: "http://export.arxiv.org/rss/cs.AI", category: "ai-ml", enabled: true },
  { name: "arXiv cs.LG", url: "http://export.arxiv.org/rss/cs.LG", category: "ai-ml", enabled: true },
  { name: "arXiv cs.RO", url: "http://export.arxiv.org/rss/cs.RO", category: "robotics", enabled: true },
  { name: "Hacker News", url: "https://hnrss.org/frontpage", category: "general-tech", enabled: true },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "cybersecurity", enabled: true },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cybersecurity", enabled: true },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", category: "cybersecurity", enabled: true },
  { name: "IEEE Spectrum Robotics", url: "https://spectrum.ieee.org/feeds/topic/robotics.rss", category: "robotics", enabled: true },
];
```

- [ ] **Step 3: Write the failing test for `providers.ts`**

```typescript
// lib/config/providers.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { getProviders } from "./providers";

describe("getProviders", () => {
  afterEach(() => {
    if (existsSync("config")) rmSync("config", { recursive: true, force: true });
  });

  it("returns an empty array by default", async () => {
    const result = await getProviders();
    expect(result).toEqual([]);
  });

  it("returns configured providers", async () => {
    mkdirSync("config", { recursive: true });
    writeFileSync(
      "config/providers.json",
      JSON.stringify([{ id: "p1", label: "Test", baseUrl: "http://x", apiKey: "k", kind: "openai-compatible" }])
    );
    const result = await getProviders();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("p1");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- lib/config/providers.test.ts`
Expected: FAIL — `Cannot find module './providers'`.

- [ ] **Step 5: Write `lib/config/providers.ts`**

```typescript
// lib/config/providers.ts
import { readConfig } from "./read-config";
import type { Provider } from "./types";

export async function getProviders(): Promise<Provider[]> {
  return readConfig<Provider[]>("config/providers.json", []);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- lib/config/providers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Write the failing test for `sources.ts`**

```typescript
// lib/config/sources.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSources } from "./sources";
import { SEED_SOURCES } from "./seed-sources";

describe("getSources", () => {
  afterEach(() => {
    if (existsSync("config")) rmSync("config", { recursive: true, force: true });
  });

  it("seeds the starter source list by default", async () => {
    const result = await getSources();
    expect(result).toEqual(SEED_SOURCES);
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm test -- lib/config/sources.test.ts`
Expected: FAIL — `Cannot find module './sources'`.

- [ ] **Step 9: Write `lib/config/sources.ts`**

```typescript
// lib/config/sources.ts
import { readConfig } from "./read-config";
import type { Source } from "./types";
import { SEED_SOURCES } from "./seed-sources";

export async function getSources(): Promise<Source[]> {
  return readConfig<Source[]>("config/sources.json", SEED_SOURCES);
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `npm test -- lib/config/sources.test.ts`
Expected: PASS (1 test).

- [ ] **Step 11: Write the failing test for `settings.ts`**

```typescript
// lib/config/settings.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSettings } from "./settings";

describe("getSettings", () => {
  afterEach(() => {
    if (existsSync("config")) rmSync("config", { recursive: true, force: true });
  });

  it("returns blank defaults by default", async () => {
    const result = await getSettings();
    expect(result.budgetCapUsd).toBeNull();
    expect(result.postsRetentionRuns).toBeNull();
    expect(result.scheduleDays).toEqual([]);
    expect(result.voiceProfile).toEqual({ toneNotes: "", examplePosts: [], interests: [] });
    expect(result.curationProviderId).toBeNull();
    expect(result.draftingProviderId).toBeNull();
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `npm test -- lib/config/settings.test.ts`
Expected: FAIL — `Cannot find module './settings'`.

- [ ] **Step 13: Write `lib/config/settings.ts`**

```typescript
// lib/config/settings.ts
import { readConfig } from "./read-config";
import type { Settings } from "./types";

const DEFAULT_SETTINGS: Settings = {
  budgetCapUsd: null,
  postsRetentionRuns: null,
  scheduleDays: [],
  voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
  curationProviderId: null,
  curationModel: null,
  draftingProviderId: null,
  draftingModel: null,
};

export async function getSettings(): Promise<Settings> {
  return readConfig<Settings>("config/settings.json", DEFAULT_SETTINGS);
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npm test -- lib/config/settings.test.ts`
Expected: PASS (1 test).

- [ ] **Step 15: Run the full test suite**

Run: `npm test`
Expected: all tests across all 6 tasks pass (client, schema, migrate, read-config, providers, sources, settings).

- [ ] **Step 16: Verify `.gitignore` covers `config/`**

Read `.gitignore` — confirm `config/` is present (already added in a prior session per `current-task.md`). No action needed if present.

- [ ] **Step 17: Regenerate `tree.md`**

Run (per this project's CLAUDE.md convention):
```bash
PYTHONIOENCODING=utf-8 python .claude/generate_tree.py > tree.md
```

- [ ] **Step 18: Commit**

```bash
git add lib/config/ tree.md
git commit -m "feat: wire providers.json, sources.json, settings.json config layer"
```

---

## Phase 1 Acceptance Check (matches PHASE-1-DATA-FOUNDATION.md's "Verifiable at end of phase")

- [ ] `npm run db:migrate` run against a fresh `data/` directory creates all 4 tables with the correct schema.
- [ ] `config/` auto-creates with sensible defaults on first access (empty `providers.json`, `sources.json` seeded with the starter list, blank `settings.json`).
- [ ] Every file above can be read/written by a standalone script (proven by the test suite itself, which exercises each function directly).
