// scripts/view-runs.ts
/**
 * Read-only CLI to check whether past pipeline runs succeeded or aborted,
 * and why. `npm run pipeline` reports its own outcome to the terminal when
 * it finishes, but that output is gone the moment the terminal is closed —
 * this reads the persisted record back out of data/sift.db instead. Never
 * touches an LLM provider or spends any quota.
 *
 * Usage:
 *
 *     npm run view-runs
 */
import { desc } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { pipelineRunsTable } from "../lib/db/schema";

export async function formatRuns(): Promise<string> {
  const db = getDb();
  const runs = await db.select().from(pipelineRunsTable).orderBy(desc(pipelineRunsTable.id)).limit(20);

  if (runs.length === 0) {
    return "No pipeline runs yet. Run `npm run pipeline` first.";
  }

  const lines: string[] = [];
  for (const run of runs) {
    const outcome = run.status === "success" ? "SUCCESS" : `ABORTED (${run.abortReason})`;
    lines.push(`Run #${run.id} — ${run.type} — ${outcome} — started ${run.startedAt.toISOString()}`);
    if (run.status === "aborted" && run.errorMessage) {
      lines.push(`  Reason: ${run.errorMessage}`);
    }
  }

  return lines.join("\n");
}

if (process.argv[1]?.endsWith("view-runs.ts")) {
  formatRuns().then((output) => {
    // eslint-disable-next-line no-console
    console.log(output);
  });
}
