/**
 * Curation stage: ranks the entire eligible candidate backlog (not just
 * this run's own fresh ingestion — see runCuration's pool query below)
 * and asks the configured LLM to pick the top few worth drafting.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { candidatesTable, pipelineRunsTable } from "../db/schema";
import { repairJsonControlChars } from "../llm/json-repair";
import { getEnabledSourceIds } from "../db/sources";
import { getSettings } from "../config/settings";
import { getProviders } from "../config/providers";
import { callLLM } from "../llm/provider";
import { assertBudgetAvailable, logLlmCall } from "../llm/cost-safety";

export interface CuratedItem {
  id: number;
  url: string;
  sourceRecap: string;
  whyPicked: string;
}

interface RankingResponse {
  selected: { id: string; whyPicked: string }[];
}

// Originally 1000 — enough for a non-reasoning model's small JSON output,
// but measured against a real reasoning model (Gemini's
// gemini-flash-latest) with a full 40-item pool: it spent ~957 of the
// 1000 tokens on hidden reasoning before writing any visible JSON, got
// cut off mid-structure (finish_reason: "length") with only 39 visible
// tokens written. A real, working model/key/prompt, failing purely
// because the budget left no room for both the hidden reasoning AND the
// actual output. 4000 gives real headroom for that reasoning overhead on
// top of the small JSON payload this stage actually needs.
const MAX_OUTPUT_TOKENS = 4000;
const INPUT_GUARD_LIMIT = 40;

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fenced ? fenced[1] : content).trim();
}

// Balances which sources make it into the guarded pool, so a single
// prolific source (one that simply ingests far more often than others)
// can't crowd out every other source before the diversity filter below
// ever gets real alternatives to work with — a real observed case: with
// plain oldest-N truncation, the guarded pool came back 100% from one
// source, leaving the final-pick diversity filter nothing to diversify
// against.
//
// Groups by source FIRST, rather than walking the overall oldest-first
// list and stopping cold once `limit` items are collected — that
// simpler-looking single-pass approach was tried and measured against
// real data (12 distinct sources) to be subtly broken: sources whose
// oldest items happen to sort later in the *overall* interleaved id
// order got arbitrarily shortchanged below their fair share (one source
// vanished entirely) purely because of processing order, not because
// they lacked data. Grouping by source first guarantees every source
// gets a genuine shot at its full fair share before any trimming happens.
//
// Every distinct source gets an even share (`ceil(limit / distinct
// source count)`) of its own oldest items. If the combined fair shares
// exceed `limit`, trim down to the oldest `limit` across that combined,
// already-capped set (still bounded per source, so trimming can't
// re-introduce the crowding-out problem). If they fall short (some
// source didn't have enough to fill its share), top off with whatever's
// left over each source's cap, oldest-first, regardless of source.
function buildBalancedGuardedPool<T extends { id: number; sourceId: number | null }>(
  pool: T[],
  limit: number
): T[] {
  if (pool.length <= limit) return pool;

  const bySource = new Map<number | null, T[]>();
  for (const row of pool) {
    const list = bySource.get(row.sourceId);
    if (list) list.push(row);
    else bySource.set(row.sourceId, [row]);
  }
  // `pool` is already oldest-first overall, so each per-source bucket
  // built by iterating it in order is also oldest-first.

  const perSourceCap = Math.ceil(limit / bySource.size);
  const fairShare: T[] = [];
  const leftover: T[] = [];
  for (const rows of bySource.values()) {
    fairShare.push(...rows.slice(0, perSourceCap));
    leftover.push(...rows.slice(perSourceCap));
  }
  fairShare.sort((a, b) => a.id - b.id);

  if (fairShare.length >= limit) {
    return fairShare.slice(0, limit);
  }

  leftover.sort((a, b) => a.id - b.id);
  const guarded = fairShare;
  for (const row of leftover) {
    if (guarded.length >= limit) break;
    guarded.push(row);
  }
  return guarded.sort((a, b) => a.id - b.id);
}

export async function runCuration(runId: number): Promise<CuratedItem[]> {
  const db = getDb();

  // Every source disabled → nothing is eligible regardless of the
  // candidates table's contents; short-circuit before even querying it,
  // mirroring the empty-pool check just below.
  const enabledSourceIds = await getEnabledSourceIds();
  if (enabledSourceIds.length === 0) {
    await db.update(pipelineRunsTable).set({ currentStage: "Curating 0 candidate(s)…" }).where(eq(pipelineRunsTable.id, runId));
    return [];
  }

  // Not scoped to this run's own ingestion: a candidate ingested by an
  // earlier run that never reached curation (aborted run, dedup meant this
  // run found nothing new) must still be eligible — runId on a candidate
  // records which run discovered it, not an expiry boundary. Oldest first
  // so a backlog drains in order instead of newest-always-wins. Also
  // excludes candidates from a since-disabled source — a candidate whose
  // sourceId isn't in enabledSourceIds (including sourceId = NULL, for
  // legacy/unparseable rows — SQL IN never matches NULL) never enters the
  // pool, regardless of how long ago it was ingested.
  const pool = await db
    .select()
    .from(candidatesTable)
    .where(and(eq(candidatesTable.chosen, false), inArray(candidatesTable.sourceId, enabledSourceIds)))
    .orderBy(asc(candidatesTable.id));

  const guarded = buildBalancedGuardedPool(pool, INPUT_GUARD_LIMIT);
  // Written here, not by the caller (executePipelineRun) — the pool size
  // (the whole eligible backlog, capped at INPUT_GUARD_LIMIT) is only known
  // once this query runs, and is very often much larger than "candidates
  // ingested this run": a candidate from an earlier run that never got
  // curated is still in this same pool.
  await db
    .update(pipelineRunsTable)
    .set({ currentStage: `Curating ${guarded.length} candidate(s)…` })
    .where(eq(pipelineRunsTable.id, runId));
  if (guarded.length === 0) {
    return [];
  }

  const settings = await getSettings();
  const providers = await getProviders();
  const provider = providers.find((p) => p.id === settings.curationProviderId);
  if (!provider || !settings.curationModel) {
    throw new Error("No curation provider/model configured");
  }

  // Ask for a ranked shortlist well beyond curationTopN — the source-
  // diversity filter below needs real alternatives to fall back to. Enforcing
  // "no two picks from the same source" is a deterministic, code-side
  // constraint, not something asked of the model: an LLM instruction to
  // "avoid picking from the same source twice" is exactly the kind of hard
  // structural rule this project has repeatedly found LLMs unreliable at
  // self-enforcing (see the parse-failure/hallucination handling above,
  // and the global issue log) — a query-level filter over a large enough
  // ranked list is deterministic and can't be talked out of it.
  const shortlistSize = Math.min(guarded.length, settings.curationTopN * 5);
  const promptText = buildRankingPrompt(guarded, settings.voiceProfile, shortlistSize);
  const promptTokens = Math.ceil(promptText.length / 4); // rough estimate, refined by real usage post-call

  await assertBudgetAvailable(settings.curationModel, promptTokens, MAX_OUTPUT_TOKENS);

  const result = await callLLM(
    provider,
    settings.curationModel,
    [{ role: "user", content: promptText }],
    { maxOutputTokens: MAX_OUTPUT_TOKENS }
  );

  await logLlmCall({
    runId,
    provider: provider.id,
    model: settings.curationModel,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  // A malformed/unparseable response is a real failure, not a legitimate
  // "nothing worth posting" — it must surface as an aborted run with a
  // visible error, not silently look like a normal empty-selection success.
  let parsed: RankingResponse;
  try {
    parsed = JSON.parse(repairJsonControlChars(extractJson(result.content)));
  } catch {
    throw new Error(`Curation response was not valid JSON: ${result.content.slice(0, 300)}`);
  }
  if (!Array.isArray(parsed.selected)) {
    throw new Error(`Curation response was missing a "selected" array: ${result.content.slice(0, 300)}`);
  }

  const resolved: CuratedItem[] = [];
  for (const sel of parsed.selected) {
    const match = guarded.find((row) => String(row.id) === sel.id);
    if (match) {
      resolved.push({ id: match.id, url: match.url, sourceRecap: match.sourceRecap, whyPicked: sel.whyPicked });
    }
  }

  // The model tried to select something, but every id it named was
  // hallucinated (matched no real candidate) — also a real failure, not
  // the same as the model legitimately returning `selected: []`.
  if (parsed.selected.length > 0 && resolved.length === 0) {
    throw new Error(`Curation selected ${parsed.selected.length} item(s) but none matched a real candidate id.`);
  }

  // Deterministic source-diversity filter: walk the model's ranked shortlist
  // in order and keep its first pick per source, skipping any later item
  // whose source was already used — never two posts from the same source
  // in one run's final selection. `guarded` (not `resolved`, which lost the
  // sourceId field) is the lookup for each candidate's actual source.
  const sourceIdById = new Map(guarded.map((row) => [row.id, row.sourceId]));
  const diverse: CuratedItem[] = [];
  const usedSourceIds = new Set<number | null>();
  for (const item of resolved) {
    const sourceId = sourceIdById.get(item.id) ?? null;
    if (usedSourceIds.has(sourceId)) continue;
    usedSourceIds.add(sourceId);
    diverse.push(item);
    if (diverse.length >= settings.curationTopN) break;
  }

  if (diverse.length > 0) {
    await db.update(candidatesTable).set({ chosen: true }).where(
      inArray(candidatesTable.id, diverse.map((r) => r.id))
    );
  }

  return diverse;
}

function buildRankingPrompt(
  pool: { id: number; sourceRecap: string }[],
  profile: { toneNotes: string; interests: string[] },
  shortlistSize: number
): string {
  const itemLines = pool.map((item) => `- id ${item.id}: ${item.sourceRecap}`).join("\n");
  return [
    "You are ranking news items for a user with these interests: " + profile.interests.join(", ") + ".",
    `Rank up to ${shortlistSize} of the most important/relevant items from the list below, best first, personalized to those interests.`,
    `Only include items that are genuinely worth posting about — a shorter list is fine if fewer items qualify, never pad the list with weak picks just to hit the number.`,
    "Order matters: put your single best pick first, then the next-best, and so on — a later step may not use every item you list, and relies on this ordering to decide which ones it actually uses.",
    "Respond with ONLY valid JSON matching this shape: {\"selected\": [{\"id\": string, \"whyPicked\": string}]}.",
    "Return only the ids from the list below — never invent an id.",
    "",
    "Items:",
    itemLines,
  ].join("\n");
}
