/**
 * Costs page (`/config/costs`) — Server Component.
 *
 * Loads the current settings (for the persisted budget cap) and the current
 * UTC calendar month's spend — the running total via `getMonthlySpend`, a
 * daily breakdown via `getDailySpendForMonth` (backs the day-by-day chart),
 * and a per-model breakdown via `getSpendByModel` — then hands all three to
 * the interactive `CostsForm`. This page makes no LLM calls of its own; it
 * is pure config read/write plus read-only DB aggregate queries.
 *
 * `getCheckSpend` is the fourth query: what model checking cost this month,
 * kept separate from pipeline spend because they answer different questions.
 * Both are real money; neither used to be visible.
 */
import { getSettings } from "../../../lib/config/settings";
import { getMonthlySpend, getDailySpendForMonth, getSpendByModel, getCheckSpend } from "../../../lib/config/cost-history";
import { CostsForm } from "./CostsForm";

// Reads live DB state that doesn't exist yet at build time (a fresh clone's
// database has no llm_calls table until migrations run at server startup) —
// must never be statically prerendered.
export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const settings = await getSettings();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [spend, dailySpend, spendByModel, checkSpend] = await Promise.all([
    getMonthlySpend(currentMonth),
    getDailySpendForMonth(currentMonth),
    getSpendByModel(currentMonth),
    getCheckSpend(currentMonth),
  ]);
  return (
    <main>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Costs</h1>
          <p className="page-head-sub">What this month has cost, and what is spending it.</p>
        </div>
      </div>
      <CostsForm
        budgetCapUsd={settings.budgetCapUsd}
        currentMonth={currentMonth}
        spend={spend}
        dailySpend={dailySpend}
        spendByModel={spendByModel}
        checkSpend={checkSpend}
      />
    </main>
  );
}
