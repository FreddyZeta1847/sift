/**
 * Batch draft-generation pipeline entry point (Phase 2, DRAFT-GENERATOR).
 *
 * Thin wrapper around generateDrafts() (lib/draft/generate.ts): calls it to
 * get resolved drafts, then batch-inserts them into `posts` with
 * pending: false. All enrichment/LLM/parsing logic lives in generateDrafts()
 * so it can be reused verbatim by a later per-post Regenerate flow, which
 * will call generateDrafts() directly and insert with pending: true instead.
 */
import { getDb } from "../db/client";
import { postsTable } from "../db/schema";
import { generateDrafts } from "./generate";
import type { CuratedItem } from "../curation/run";

export async function runDraftGenerator(
  items: CuratedItem[],
  runId: number
): Promise<{ written: number }> {
  const resolved = await generateDrafts(items, runId);

  const db = getDb();
  if (resolved.length > 0) {
    await db.insert(postsTable).values(
      resolved.map((r) => ({
        candidateId: r.candidateId,
        runId,
        url: r.url,
        title: r.title,
        originalText: r.text,
        imagePrompt: r.imagePrompt,
      }))
    );
  }

  return { written: resolved.length };
}
