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

export interface SourceBreakdown {
  source: string;
  fetched: number;
  written: number;
}

export interface IngestionResult {
  fetched: number;
  written: number;
  skippedSources: string[];
  perSource: SourceBreakdown[];
}

export async function runIngestion(sources: Source[], runId: number): Promise<IngestionResult> {
  const db = getDb();
  const enabled = sources.filter((s) => s.enabled);
  const normalized: NormalizedItem[] = [];
  const skippedSources: string[] = [];
  const fetchedBySource = new Map<string, number>();

  for (const source of enabled) {
    try {
      const raw = await fetchSource(source);
      const items = raw.map((item) => normalize(item, source));
      normalized.push(...items);
      fetchedBySource.set(source.name, items.length);
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

  const writtenBySource = new Map<string, number>();
  for (const item of surviving) {
    writtenBySource.set(item.source, (writtenBySource.get(item.source) ?? 0) + 1);
  }

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

  const perSource: SourceBreakdown[] = enabled.map((s) => ({
    source: s.name,
    fetched: fetchedBySource.get(s.name) ?? 0,
    written: writtenBySource.get(s.name) ?? 0,
  }));

  return { fetched: normalized.length, written: surviving.length, skippedSources, perSource };
}
