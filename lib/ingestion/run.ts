import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { candidatesTable } from "../db/schema";
import type { Source } from "../config/types";
import { fetchSource } from "./fetch";
import { normalize, type NormalizedItem } from "./normalize";
import { delayBetweenFetches } from "./rate-limit";

function toSourceRecap(item: NormalizedItem): string {
  return `${item.title} — ${item.source} (${item.category}): ${item.summary}`;
}

export async function runIngestion(
  sources: Source[],
  runId: number
): Promise<{ fetched: number; written: number; skippedSources: string[] }> {
  const db = getDb();
  const enabled = sources.filter((s) => s.enabled);
  const normalized: NormalizedItem[] = [];
  const skippedSources: string[] = [];

  for (const source of enabled) {
    try {
      const raw = await fetchSource(source);
      normalized.push(...raw.map((item) => normalize(item, source)));
    } catch (err) {
      console.error(`[sift] Ingestion: source "${source.name}" failed: ${(err as Error).message}`);
      skippedSources.push(source.name);
    }
    await delayBetweenFetches();
  }

  const existingUrls = new Set(
    (await db.select({ url: candidatesTable.url }).from(candidatesTable)).map((r) => r.url)
  );
  const seenInThisRun = new Set<string>();
  const surviving = normalized.filter((item) => {
    if (existingUrls.has(item.url) || seenInThisRun.has(item.url)) return false;
    seenInThisRun.add(item.url);
    return true;
  });

  if (surviving.length > 0) {
    await db.insert(candidatesTable).values(
      surviving.map((item) => ({
        runId,
        url: item.url,
        sourceRecap: toSourceRecap(item),
        chosen: false,
        createdAt: new Date(),
      }))
    );
  }

  return { fetched: normalized.length, written: surviving.length, skippedSources };
}
