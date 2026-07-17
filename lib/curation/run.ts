import { asc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { candidatesTable } from "../db/schema";
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

  // Not scoped to this run's own ingestion: a candidate ingested by an
  // earlier run that never reached curation (aborted run, dedup meant this
  // run found nothing new) must still be eligible — runId on a candidate
  // records which run discovered it, not an expiry boundary. Oldest first
  // so a backlog drains in order instead of newest-always-wins.
  const pool = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.chosen, false))
    .orderBy(asc(candidatesTable.id));

  const guarded = pool.slice(0, INPUT_GUARD_LIMIT);
  if (guarded.length === 0) {
    return [];
  }

  const settings = await getSettings();
  const providers = await getProviders();
  const provider = providers.find((p) => p.id === settings.curationProviderId);
  if (!provider || !settings.curationModel) {
    throw new Error("No curation provider/model configured");
  }

  const promptText = buildRankingPrompt(guarded, settings.voiceProfile);
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

  let parsed: RankingResponse;
  try {
    parsed = JSON.parse(extractJson(result.content));
  } catch {
    return [];
  }
  const resolved: CuratedItem[] = [];
  for (const sel of parsed.selected) {
    const match = guarded.find((row) => String(row.id) === sel.id);
    if (match) {
      resolved.push({ id: match.id, url: match.url, sourceRecap: match.sourceRecap, whyPicked: sel.whyPicked });
    }
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
  profile: { toneNotes: string; interests: string[] }
): string {
  const itemLines = pool.map((item) => `- id ${item.id}: ${item.sourceRecap}`).join("\n");
  return [
    "You are ranking news items for a user with these interests: " + profile.interests.join(", ") + ".",
    "Pick the top 3 most important/relevant items from the list below, personalized to those interests.",
    "Respond with ONLY valid JSON matching this shape: {\"selected\": [{\"id\": string, \"whyPicked\": string}]}.",
    "Return only the ids from the list below — never invent an id.",
    "",
    "Items:",
    itemLines,
  ].join("\n");
}
