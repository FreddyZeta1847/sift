// scripts/view-candidates.ts
/**
 * Read-only CLI to inspect the candidate backlog — every article ingestion
 * has ever pulled in, whether curation picked it or not. Useful for
 * checking dedup/retention behavior and seeing what's sitting unchosen
 * (see lib/curation/run.ts — that backlog is exactly what future runs draw
 * from). Default output is a compact table; pass --json for the raw rows.
 * Never touches an LLM provider or spends any quota.
 *
 * Usage:
 *
 *     npm run view-candidates
 *     npm run view-candidates -- --json
 */
import { desc } from "drizzle-orm";
import { getDb } from "../lib/db/client";
import { candidatesTable } from "../lib/db/schema";

const DISPLAY_LIMIT = 50;

export async function getCandidatesForDisplay() {
  const db = getDb();
  return db.select().from(candidatesTable).orderBy(desc(candidatesTable.id)).limit(DISPLAY_LIMIT);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

export async function formatCandidatesTable(): Promise<string> {
  const rows = await getCandidatesForDisplay();
  if (rows.length === 0) {
    return "No candidates yet. Run `npm run pipeline` first.";
  }

  const header = ["ID", "CHOSEN", "RUN", "CREATED", "SOURCE", "RECAP"];
  const dataRows = rows.map((r) => [
    String(r.id),
    r.chosen ? "yes" : "-",
    String(r.runId),
    r.createdAt.toISOString().slice(0, 16).replace("T", " "),
    hostOf(r.url),
    truncate(r.sourceRecap, 60),
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...dataRows.map((row) => row[i].length)));
  const formatRow = (cols: string[]) => cols.map((c, i) => c.padEnd(widths[i])).join("  ");

  return [formatRow(header), ...dataRows.map(formatRow)].join("\n");
}

if (process.argv[1]?.endsWith("view-candidates.ts")) {
  const asJson = process.argv.includes("--json");
  const output = asJson
    ? getCandidatesForDisplay().then((rows) => JSON.stringify(rows, null, 2))
    : formatCandidatesTable();
  output.then((text) => {
    // eslint-disable-next-line no-console
    console.log(text);
  });
}
