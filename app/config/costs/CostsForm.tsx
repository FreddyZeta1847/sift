/**
 * Interactive form for the Costs page (`/config/costs`).
 *
 * Client Component. The budget cap field follows the exact same
 * optimistic-update-with-rollback pattern established (and reviewer-fixed)
 * for retention in `app/config/settings/SettingsForm.tsx`: local `useState`
 * seeded from `budgetCapUsd`, paired with an "unlimited" checkbox (checked
 * means `null`); every change captures the pre-update value and calls
 * `saveBudgetCap` immediately, reverting local state back to the captured
 * previous value if the action reports `!result.ok` so a failed save never
 * leaves the UI showing an unpersisted value with only the status line as a
 * clue.
 *
 * `spend`/`currentMonth` are plain read-only props straight from the Server
 * Component — there is no client-side re-fetch of these on save, since
 * saving the cap doesn't change the spend total. (A `router.refresh()` isn't
 * needed here for that reason, unlike the other config pages' forms.)
 */
"use client";

import { useState } from "react";
import { saveBudgetCap } from "./actions";

export function CostsForm({
  budgetCapUsd,
  currentMonth,
  spend,
}: {
  budgetCapUsd: number | null;
  currentMonth: string;
  spend: number;
}) {
  const [cap, setCap] = useState<number | null>(budgetCapUsd);
  const [status, setStatus] = useState<string | null>(null);

  const persistCap = async (value: number | null, previous: number | null) => {
    const result = await saveBudgetCap(value);
    if (!result.ok) {
      setCap(previous);
      setStatus(`Save failed: ${result.error}`);
      return;
    }
    setStatus("Budget cap saved.");
  };

  const handleCapChange = (value: number | null) => {
    const previous = cap;
    setCap(value);
    persistCap(value, previous);
  };

  return (
    <section>
      <h2>Budget cap</h2>
      <label>
        Monthly budget cap (USD)
        <input
          type="number"
          min={0}
          step="0.01"
          value={cap ?? ""}
          disabled={cap === null}
          onChange={(e) => handleCapChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={cap === null}
          onChange={(e) => handleCapChange(e.target.checked ? null : 0)}
        />
        Unlimited
      </label>
      {status && <p role="alert">{status}</p>}

      <h2>This month</h2>
      <p>
        {cap !== null
          ? `$${spend.toFixed(2)} of $${cap.toFixed(2)} cap spent this month (${currentMonth}).`
          : `$${spend.toFixed(2)} spent this month (${currentMonth}).`}
      </p>
    </section>
  );
}
