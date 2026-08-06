/**
 * Drizzle table definitions for sift's one SQLite database — the
 * "recorded history" half of the config/history split (see
 * lib/config/* for the JSON-authored counterpart). Tables: pipeline
 * runs, the source identity registry, candidates, posts, LLM calls,
 * and post translations.
 */
import { sqliteTable, integer, text, real } from "drizzle-orm/sqlite-core";

export const pipelineRunsTable = sqliteTable("pipeline_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  finishedAt: integer("finished_at", { mode: "timestamp" }),
  status: text("status", { enum: ["success", "aborted"] }),
  abortReason: text("abort_reason", { enum: ["budget_cap", "api_error", "server_restart"] }),
  errorMessage: text("error_message"),
  type: text("type", {
    enum: ["scheduled", "catchup", "manual", "regenerate-posts"],
  }).notNull(),
  // Nullable, free-text — live progress for a run still in flight (e.g.
  // "Curating 87 candidate(s)…"), written by executePipelineRun() at each
  // milestone and cleared back to null on both terminal outcomes. Powers
  // the sidebar's polled Run Now progress display; not a status enum
  // since the exact wording/counts vary per stage.
  currentStage: text("current_stage"),
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

// One row per (postId, language) pair — not versioned, matching the
// project's established "no edit-history" pattern (see
// TRANSLATION--architecture.md). Re-translating an already-translated
// post/language overwrites translatedText in place and resets outdated
// to false, rather than adding a new row.
export const postTranslationsTable = sqliteTable("post_translations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id")
    .notNull()
    .references(() => postsTable.id),
  language: text("language", { enum: ["es", "fr", "de", "it", "pt"] }).notNull(),
  translatedText: text("translated_text").notNull(),
  // Flipped true whenever posts.editedText or posts.originalText changes
  // for this postId after a translation already exists — see
  // TRANSLATION--architecture.md's "Staleness" section. Writing that flip
  // is the responsibility of REVIEW-WORKSPACE's edit-save and
  // regenerate-pick-winner Server Actions, not this module.
  outdated: integer("outdated", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});
