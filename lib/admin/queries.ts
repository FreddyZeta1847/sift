/**
 * Read-only list/search/paginate layer for the Admin page (`/admin` and its
 * sub-routes) — the data-fetching half of the search/filter/delete admin
 * surface described in vault-sift/features/CONFIG-UI/CONFIG-UI--admin-page.md.
 * Deletion itself (and its FK-integrity rules) lives in lib/admin/delete.ts,
 * kept separate so this file stays pure reads, unit-testable without
 * worrying about mutation ordering.
 *
 * Every list function follows the same shape: an options bag with a
 * table-specific set of filters plus `page`/`q`, returning a `Page<T>`
 * (rows + total + page + pageSize) for the caller to render pagination
 * controls from. `id`, when given, short-circuits every other filter to a
 * single-row lookup — the fastest, least ambiguous way to jump straight to
 * a specific row once you already know its id (e.g. the id now shown next
 * to a post's title on the Review page). `q` is a plain SQL `LIKE`
 * substring match over each table's free-text columns — not full-text
 * search, which is unnecessary at this project's single-user scale.
 */
import { and, count, desc, eq, gte, inArray, isNull, like, lt, or } from "drizzle-orm";
import { getDb } from "../db/client";
import { pipelineRunsTable, candidatesTable, postsTable, llmCallsTable } from "../db/schema";
import type { RunRow, PostRow } from "../review/queries";

const PAGE_SIZE = 25;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type CandidateRow = typeof candidatesTable.$inferSelect;
export type LlmCallRow = typeof llmCallsTable.$inferSelect;

// ---------------------------------------------------------------------
// Pipeline runs
// ---------------------------------------------------------------------

export interface ListRunsOptions {
  page?: number;
  id?: number;
  type?: RunRow["type"];
  status?: "success" | "aborted" | "incomplete";
  date?: string; // "YYYY-MM-DD", matches resolveRunIdForDate's day-range semantics
}

export async function listRuns(opts: ListRunsOptions): Promise<Page<RunRow>> {
  const db = getDb();
  const page = opts.page ?? 1;

  if (opts.id !== undefined) {
    const rows = await db.select().from(pipelineRunsTable).where(eq(pipelineRunsTable.id, opts.id));
    return { rows, total: rows.length, page: 1, pageSize: PAGE_SIZE };
  }

  const conditions = [];
  if (opts.type) conditions.push(eq(pipelineRunsTable.type, opts.type));
  if (opts.status === "success" || opts.status === "aborted") {
    conditions.push(eq(pipelineRunsTable.status, opts.status));
  } else if (opts.status === "incomplete") {
    conditions.push(isNull(pipelineRunsTable.status));
  }
  if (opts.date) {
    const dayStart = new Date(`${opts.date}T00:00:00.000Z`);
    const dayEnd = new Date(`${opts.date}T23:59:59.999Z`);
    conditions.push(and(gte(pipelineRunsTable.startedAt, dayStart), lt(pipelineRunsTable.startedAt, dayEnd)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(pipelineRunsTable)
      .where(where)
      .orderBy(desc(pipelineRunsTable.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(pipelineRunsTable).where(where),
  ]);

  return { rows, total: Number(total), page, pageSize: PAGE_SIZE };
}

// ---------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------

export interface ListCandidatesOptions {
  page?: number;
  id?: number;
  runId?: number;
  chosen?: boolean;
  q?: string;
}

export interface CandidateRowWithPost extends CandidateRow {
  hasPost: boolean;
}

async function attachHasPost(rows: CandidateRow[]): Promise<CandidateRowWithPost[]> {
  if (rows.length === 0) return [];
  const db = getDb();
  const ids = rows.map((r) => r.id);
  const referenced = await db
    .selectDistinct({ candidateId: postsTable.candidateId })
    .from(postsTable)
    .where(inArray(postsTable.candidateId, ids));
  const referencedIds = new Set(referenced.map((r) => r.candidateId));
  return rows.map((r) => ({ ...r, hasPost: referencedIds.has(r.id) }));
}

export async function listCandidates(opts: ListCandidatesOptions): Promise<Page<CandidateRowWithPost>> {
  const db = getDb();
  const page = opts.page ?? 1;

  if (opts.id !== undefined) {
    const rows = await db.select().from(candidatesTable).where(eq(candidatesTable.id, opts.id));
    const withPost = await attachHasPost(rows);
    return { rows: withPost, total: rows.length, page: 1, pageSize: PAGE_SIZE };
  }

  const conditions = [];
  if (opts.runId !== undefined) conditions.push(eq(candidatesTable.runId, opts.runId));
  if (opts.chosen !== undefined) conditions.push(eq(candidatesTable.chosen, opts.chosen));
  if (opts.q) {
    conditions.push(or(like(candidatesTable.url, `%${opts.q}%`), like(candidatesTable.sourceRecap, `%${opts.q}%`)));
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(candidatesTable)
      .where(where)
      .orderBy(desc(candidatesTable.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(candidatesTable).where(where),
  ]);

  const withPost = await attachHasPost(rows);
  return { rows: withPost, total: Number(total), page, pageSize: PAGE_SIZE };
}

// ---------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------

export interface ListPostsOptions {
  page?: number;
  id?: number;
  runId?: number;
  posted?: boolean;
  discarded?: boolean;
  q?: string;
}

export async function listPosts(opts: ListPostsOptions): Promise<Page<PostRow>> {
  const db = getDb();
  const page = opts.page ?? 1;

  if (opts.id !== undefined) {
    const rows = await db.select().from(postsTable).where(eq(postsTable.id, opts.id));
    return { rows, total: rows.length, page: 1, pageSize: PAGE_SIZE };
  }

  const conditions = [];
  if (opts.runId !== undefined) conditions.push(eq(postsTable.runId, opts.runId));
  if (opts.posted !== undefined) conditions.push(eq(postsTable.posted, opts.posted));
  if (opts.discarded !== undefined) conditions.push(eq(postsTable.discarded, opts.discarded));
  if (opts.q) {
    conditions.push(
      or(
        like(postsTable.title, `%${opts.q}%`),
        like(postsTable.url, `%${opts.q}%`),
        like(postsTable.originalText, `%${opts.q}%`),
        like(postsTable.editedText, `%${opts.q}%`)
      )
    );
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(postsTable)
      .where(where)
      .orderBy(desc(postsTable.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(postsTable).where(where),
  ]);

  return { rows, total: Number(total), page, pageSize: PAGE_SIZE };
}

// ---------------------------------------------------------------------
// LLM calls
// ---------------------------------------------------------------------

export interface ListLlmCallsOptions {
  page?: number;
  id?: number;
  runId?: number;
  provider?: string;
  model?: string;
}

export async function listLlmCalls(opts: ListLlmCallsOptions): Promise<Page<LlmCallRow>> {
  const db = getDb();
  const page = opts.page ?? 1;

  if (opts.id !== undefined) {
    const rows = await db.select().from(llmCallsTable).where(eq(llmCallsTable.id, opts.id));
    return { rows, total: rows.length, page: 1, pageSize: PAGE_SIZE };
  }

  const conditions = [];
  if (opts.runId !== undefined) conditions.push(eq(llmCallsTable.runId, opts.runId));
  if (opts.provider) conditions.push(eq(llmCallsTable.provider, opts.provider));
  if (opts.model) conditions.push(eq(llmCallsTable.model, opts.model));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(llmCallsTable)
      .where(where)
      .orderBy(desc(llmCallsTable.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(llmCallsTable).where(where),
  ]);

  return { rows, total: Number(total), page, pageSize: PAGE_SIZE };
}
