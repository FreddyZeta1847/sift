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

const MAX_OUTPUT_TOKENS = 1000;
const INPUT_GUARD_LIMIT = 40;

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fenced ? fenced[1] : content).trim();
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

  const guarded = pool.slice(0, INPUT_GUARD_LIMIT);
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

  const promptText = buildRankingPrompt(guarded, settings.voiceProfile, settings.curationTopN);
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

  if (resolved.length > 0) {
    await db.update(candidatesTable).set({ chosen: true }).where(
      inArray(candidatesTable.id, resolved.map((r) => r.id))
    );
  }

  return resolved;
}

function buildRankingPrompt(
  pool: { id: number; sourceRecap: string }[],
  profile: { toneNotes: string; interests: string[] },
  topN: number
): string {
  const itemLines = pool.map((item) => `- id ${item.id}: ${item.sourceRecap}`).join("\n");
  return [
    "You are ranking news items for a user with these interests: " + profile.interests.join(", ") + ".",
    `Pick up to ${topN} of the most important/relevant items from the list below, personalized to those interests.`,
    `Only include items that are genuinely worth posting about — picking fewer than ${topN} is fine if that's all that qualifies, never pad the list with weak picks just to hit the number.`,
    "Respond with ONLY valid JSON matching this shape: {\"selected\": [{\"id\": string, \"whyPicked\": string}]}.",
    "Return only the ids from the list below — never invent an id.",
    "",
    "Items:",
    itemLines,
  ].join("\n");
}
