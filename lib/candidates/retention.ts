// lib/candidates/retention.ts
/**
 * Prunes the never-chosen candidate backlog by age. Off by default
 * (settings.candidateRetentionDays === null); when set, deletes every
 * candidate older than that many days that was never picked by curation —
 * a candidate that already became a post is exempt regardless of age,
 * since posts.candidateId is a hard foreign key into this table and
 * deleting it would orphan the post. Run history (pipeline_runs) and post
 * retention (settings.postsRetentionRuns) are separate, untouched concerns.
 *
 * Called at the start of every pipeline run rather than on a schedule,
 * since there's no persistent background process yet.
 */
import { and, eq, lt } from "drizzle-orm";
import { getDb } from "../db/client";
import { candidatesTable } from "../db/schema";
import { getSettings } from "../config/settings";

export async function pruneStaleCandidates(): Promise<{ deleted: number }> {
  const settings = await getSettings();
  if (settings.candidateRetentionDays === null) {
    return { deleted: 0 };
  }

  const cutoff = new Date(Date.now() - settings.candidateRetentionDays * 24 * 60 * 60 * 1000);
  const db = getDb();
  const deleted = await db
    .delete(candidatesTable)
    .where(and(lt(candidatesTable.createdAt, cutoff), eq(candidatesTable.chosen, false)))
    .returning({ id: candidatesTable.id });

  return { deleted: deleted.length };
}
