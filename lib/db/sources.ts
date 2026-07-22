/**
 * Source id resolution against the `sources` DB table — an identity
 * registry only (id ↔ name), never the owner of `enabled`. That stays in
 * config/sources.json (see lib/config/sources.ts), which remains the
 * authoritative store for name/url/category/enabled — deliberately kept
 * separate to preserve the existing config-vs-data split (config/ is
 * user-editable and its own Docker volume; SQLite data/ is generated
 * history only). Duplicating `enabled` into this table would be a
 * dual-write hazard between JSON and DB.
 *
 * `resolveSourceIds` is the ingestion-side write path (upsert-by-name);
 * `getEnabledSourceIds` is the curation-side read path (never writes).
 */
import { inArray } from "drizzle-orm";
import { getDb } from "./client";
import { sourcesTable } from "./schema";
import { getSources } from "../config/sources";

// Upsert-by-name — safe to call repeatedly/concurrently for a name that
// already exists: the insert is a no-op on conflict, and the select
// afterward is what returns the id either way, so there's no
// read-then-write race window.
export async function resolveSourceIds(names: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(names)].filter((n) => n.length > 0);
  if (unique.length === 0) return new Map();

  const db = getDb();
  await db
    .insert(sourcesTable)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing();

  const rows = await db.select().from(sourcesTable).where(inArray(sourcesTable.name, unique));
  return new Map(rows.map((r) => [r.name, r.id]));
}

// Read-only — deliberately never calls resolveSourceIds (no writes on
// curation's read path). An enabled config source with zero candidates
// ever ingested just isn't in sourcesTable yet, which is fine: it
// contributes nothing to inArray(sourceId, ...) either way.
export async function getEnabledSourceIds(): Promise<number[]> {
  const sources = await getSources();
  const enabledNames = sources.filter((s) => s.enabled).map((s) => s.name);
  if (enabledNames.length === 0) return [];

  const db = getDb();
  const rows = await db
    .select({ id: sourcesTable.id })
    .from(sourcesTable)
    .where(inArray(sourcesTable.name, enabledNames));
  return rows.map((r) => r.id);
}
