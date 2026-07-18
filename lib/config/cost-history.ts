/**
 * Read-only cost aggregation for the Costs page (`/config/costs`).
 *
 * `getMonthlySpend` sums `llm_calls.estimated_cost` for a given UTC calendar
 * month — matching this project's established "current month = UTC calendar
 * month" convention used elsewhere (see `lib/llm/cost-safety.ts`). This is a
 * pure query with no LLM calls or config writes.
 */
import { and, gte, lt, sum } from "drizzle-orm";
import { getDb } from "../db/client";
import { llmCallsTable } from "../db/schema";

export async function getMonthlySpend(month: string): Promise<number> {
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  const db = getDb();
  const [row] = await db
    .select({ total: sum(llmCallsTable.estimatedCost) })
    .from(llmCallsTable)
    .where(and(gte(llmCallsTable.timestamp, monthStart), lt(llmCallsTable.timestamp, monthEnd)));

  return Number(row?.total ?? 0);
}
