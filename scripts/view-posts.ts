// scripts/view-posts.ts
/**
 * Read-only CLI to inspect generated posts without a review UI.
 *
 * Phase 3 (REVIEW-WORKSPACE) will replace this with a real browser UI; until
 * then this is the only way to see what a pipeline run produced. Prints
 * every post, most recent first, grouped under its pipeline run, with the
 * article URL, the post text (edited version if present, else the original
 * draft), the image prompt, and its discarded/posted flags. Never touches
 * an LLM provider or spends any quota — it only reads data/sift.db.
 *
 * Usage:
 *
 *     npm run view-posts
 */
import { desc, eq } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { pipelineRunsTable, postsTable } from "../lib/db/schema";

export async function formatPosts(): Promise<string> {
  const db = getDb();
  const rows = await db
    .select({
      postId: postsTable.id,
      url: postsTable.url,
      originalText: postsTable.originalText,
      editedText: postsTable.editedText,
      imagePrompt: postsTable.imagePrompt,
      discarded: postsTable.discarded,
      posted: postsTable.posted,
      runId: pipelineRunsTable.id,
      runType: pipelineRunsTable.type,
      runStartedAt: pipelineRunsTable.startedAt,
    })
    .from(postsTable)
    .innerJoin(pipelineRunsTable, eq(postsTable.runId, pipelineRunsTable.id))
    .orderBy(desc(postsTable.id));

  if (rows.length === 0) {
    return "No posts yet. Run `npm run pipeline` first.";
  }

  const lines: string[] = [];
  let lastRunId: number | null = null;

  for (const row of rows) {
    if (row.runId !== lastRunId) {
      lastRunId = row.runId;
      lines.push("");
      lines.push(`── Run #${row.runId} (${row.runType}, started ${row.runStartedAt.toISOString()}) ──`);
    }

    const flags = [row.discarded ? "DISCARDED" : null, row.posted ? "POSTED" : null]
      .filter(Boolean)
      .join(", ");

    lines.push("");
    lines.push(`Post #${row.postId}${flags ? ` [${flags}]` : ""}`);
    lines.push(`Source: ${row.url}`);
    lines.push(`Image prompt: ${row.imagePrompt}`);
    lines.push("");
    lines.push(row.editedText ?? row.originalText);
  }

  return lines.join("\n").trimStart();
}

if (process.argv[1]?.endsWith("view-posts.ts")) {
  formatPosts().then((output) => {
    // eslint-disable-next-line no-console
    console.log(output);
  });
}
