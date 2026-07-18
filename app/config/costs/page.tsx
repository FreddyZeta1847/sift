/**
 * Costs page (`/config/costs`) — Server Component.
 *
 * Loads the current settings (for the persisted budget cap) and the current
 * UTC calendar month's spend total via `getMonthlySpend`, then hands both to
 * the interactive `CostsForm`. This page makes no LLM calls of its own; it
 * is pure config read/write plus a read-only DB aggregate query.
 */
import { getSettings } from "../../../lib/config/settings";
import { getMonthlySpend } from "../../../lib/config/cost-history";
import { CostsForm } from "./CostsForm";

export default async function CostsPage() {
  const settings = await getSettings();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const spend = await getMonthlySpend(currentMonth);
  return (
    <main>
      <h1>Costs</h1>
      <CostsForm budgetCapUsd={settings.budgetCapUsd} currentMonth={currentMonth} spend={spend} />
    </main>
  );
}
