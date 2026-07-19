/**
 * Read-only cost aggregation for the Costs page (`/config/costs`).
 *
 * `getMonthlySpend` sums `llm_calls.estimated_cost` for a given UTC calendar
 * month — matching this project's established "current month = UTC calendar
 * month" convention used elsewhere (see `lib/llm/cost-safety.ts`). This is a
 * pure query with no LLM calls or config writes.
 *
 * `getDailySpendForMonth` and `getSpendByModel` back the Costs page's chart
 * and per-model breakdown, added so the page shows more than a single
 * bottom-line total. `getDailySpendForMonth` fetches per-call rows and
 * buckets them by UTC day-of-month in JS rather than a DB-side date-trunc —
 * call volume for a single self-hoster is small enough that this is simpler
 * and more portable than SQLite date-function quirks, and it reuses the same
 * month-range window as `getMonthlySpend`.
 */
import { and, count, gte, lt, sum } from "drizzle-orm";
import { getDb } from "../db/client";
import { llmCallsTable } from "../db/schema";

function monthRange(month: string): { monthStart: Date; monthEnd: Date } {
  const monthStart = new Date(`${month}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  return { monthStart, monthEnd };
}

// Costs are always displayed to the cent (`.toFixed(2)`) — rounding sums
// here avoids surfacing binary floating-point noise like 0.1 + 0.2 =
// 0.30000000000000004 from a per-call SUM/JS accumulation.
function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getMonthlySpend(month: string): Promise<number> {
  const { monthStart, monthEnd } = monthRange(month);

  const db = getDb();
  const [row] = await db
    .select({ total: sum(llmCallsTable.estimatedCost) })
    .from(llmCallsTable)
    .where(and(gte(llmCallsTable.timestamp, monthStart), lt(llmCallsTable.timestamp, monthEnd)));

  return roundToCents(Number(row?.total ?? 0));
}

export interface DailySpend {
  day: number;
  cost: number;
}

export async function getDailySpendForMonth(month: string): Promise<DailySpend[]> {
  const { monthStart, monthEnd } = monthRange(month);
  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86_400_000);

  const db = getDb();
  const rows = await db
    .select({ timestamp: llmCallsTable.timestamp, estimatedCost: llmCallsTable.estimatedCost })
    .from(llmCallsTable)
    .where(and(gte(llmCallsTable.timestamp, monthStart), lt(llmCallsTable.timestamp, monthEnd)));

  const byDay = new Array(daysInMonth).fill(0);
  for (const row of rows) {
    byDay[row.timestamp.getUTCDate() - 1] += row.estimatedCost;
  }
  return byDay.map((cost, i) => ({ day: i + 1, cost: roundToCents(cost) }));
}

export interface ModelSpend {
  provider: string;
  model: string;
  cost: number;
  calls: number;
}

export async function getSpendByModel(month: string): Promise<ModelSpend[]> {
  const { monthStart, monthEnd } = monthRange(month);

  const db = getDb();
  const rows = await db
    .select({
      provider: llmCallsTable.provider,
      model: llmCallsTable.model,
      cost: sum(llmCallsTable.estimatedCost),
      calls: count(llmCallsTable.id),
    })
    .from(llmCallsTable)
    .where(and(gte(llmCallsTable.timestamp, monthStart), lt(llmCallsTable.timestamp, monthEnd)))
    .groupBy(llmCallsTable.provider, llmCallsTable.model);

  return rows
    .map((r) => ({ provider: r.provider, model: r.model, cost: roundToCents(Number(r.cost ?? 0)), calls: Number(r.calls) }))
    .sort((a, b) => b.cost - a.cost);
}
