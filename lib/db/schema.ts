import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

export const pipelineRunsTable = sqliteTable("pipeline_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status", { enum: ["success", "aborted"] }),
  abortReason: text("abort_reason", { enum: ["budget_cap", "api_error"] }),
  errorMessage: text("error_message"),
  type: text("type", {
    enum: ["scheduled", "catchup", "manual", "regenerate-posts"],
  }).notNull(),
});

// Deliberately just id/name — an identity registry only, never the owner of
// `enabled` (that stays in config/sources.json; duplicating it here would be
// a dual-write hazard between JSON and DB). See lib/db/sources.ts.
export const sourcesTable = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const candidatesTable = sqliteTable("candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => pipelineRunsTable.id),
  url: text("url").notNull(),
  sourceRecap: text("source_recap").notNull(),
  // Nullable at the DB level, not just by convention — legacy rows ingested
  // before this column existed (and any that fail the one-time regex
  // backfill, see lib/candidates/backfill-source.ts) have no way to resolve
  // a source and are permanently excluded from curation as a result (SQL
  // IN never matches NULL). Ingestion guarantees non-null for every row it
  // writes from here on.
  sourceId: integer("source_id").references(() => sourcesTable.id),
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
  title: text("title"),
  originalText: text("original_text").notNull(),
  editedText: text("edited_text"),
  imagePrompt: text("image_prompt").notNull(),
  discarded: integer("discarded", { mode: "boolean" }).notNull().default(false),
  posted: integer("posted", { mode: "boolean" }).notNull().default(false),
  postedAt: integer("posted_at", { mode: "timestamp" }),
  pending: integer("pending", { mode: "boolean" }).notNull().default(false),
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
