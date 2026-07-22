/**
 * One-time-per-row backfill of candidates.sourceId for rows written before
 * that column existed. There's no structural source reference on a legacy
 * row — only the flattened `sourceRecap` text ("${title} — ${source}
 * (${category}): ${summary}", see lib/ingestion/run.ts's toSourceRecap) —
 * so this parses the source name back out of that string.
 *
 * A row whose sourceRecap doesn't parse (format drift, hand-edited data)
 * stays sourceId = NULL — an accepted, permanent outcome. lib/curation/run.ts's
 * enabled-source filter already excludes NULL sourceId rows for free (SQL
 * IN never matches NULL), so an unparsed row simply never re-enters
 * curation; nothing further needs to happen for it.
 *
 * Idempotent — a no-op once every row has a non-null sourceId. Called from
 * scripts/run-pipeline.ts right after pruneStaleCandidates(), so it always
 * completes before that same invocation's runCuration() call.
 */
import { inArray, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { candidatesTable } from "../db/schema";
import { resolveSourceIds } from "../db/sources";

// Lazy `.*?` + dotall (`s`) — two properties that both matter here:
//
// - `s` lets `.` cross real "\n\n" line breaks AND pseudo-newline
//   characters some feeds/extractors embed mid-title (observed in
//   production data: a U+2028 LINE SEPARATOR inside a title, invisible in
//   a terminal, silently breaks a non-dotall `.` match well before it ever
//   reaches the real "(category): " marker — this isn't a hypothetical,
//   it's the one row out of ~3000 in production that failed to parse
//   before this fix).
// - `.*?` (lazy, not greedy) stops at the FIRST "(...): " match rather
//   than the last. Categories are short controlled slugs the app itself
//   inserts (e.g. "ai-ml", "cybersecurity") immediately after the source
//   name, so the first match is reliably the real one — unlike the source
//   name/title, which can and does contain its own " — " (handled by the
//   lastIndexOf step below, on whatever precedes this match).
//
// Trade-off, accepted: if a title itself contained an earlier
// "(something): "-shaped substring, this would find that instead of the
// real marker — rarer in practice than the newline-crossing failure this
// replaces, and the failure mode is a null/wrong-guess on one legacy row,
// not a crash.
export function parseSourceFromRecap(sourceRecap: string): string | null {
  const categoryMatch = sourceRecap.match(/^(.*?) \([^()]*\): /s);
  if (!categoryMatch) return null;
  const beforeCategory = categoryMatch[1];
  const sepIndex = beforeCategory.lastIndexOf(" — ");
  if (sepIndex === -1) return null;
  const name = beforeCategory.slice(sepIndex + 3).trim();
  return name.length > 0 ? name : null;
}

export async function backfillCandidateSourceIds(): Promise<{ updated: number; skipped: number }> {
  const db = getDb();
  const unresolved = await db
    .select({ id: candidatesTable.id, sourceRecap: candidatesTable.sourceRecap })
    .from(candidatesTable)
    .where(isNull(candidatesTable.sourceId));
  if (unresolved.length === 0) {
    return { updated: 0, skipped: 0 };
  }

  const idsByName = new Map<string, number[]>();
  for (const row of unresolved) {
    const name = parseSourceFromRecap(row.sourceRecap);
    if (!name) continue;
    idsByName.set(name, [...(idsByName.get(name) ?? []), row.id]);
  }

  const sourceIds = await resolveSourceIds([...idsByName.keys()]);

  let updated = 0;
  for (const [name, ids] of idsByName) {
    const sourceId = sourceIds.get(name);
    if (sourceId === undefined) continue;
    await db.update(candidatesTable).set({ sourceId }).where(inArray(candidatesTable.id, ids));
    updated += ids.length;
  }

  return { updated, skipped: unresolved.length - updated };
}
