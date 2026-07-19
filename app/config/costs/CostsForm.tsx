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

// Visual-only helper: the failure message here always follows an
// "X failed: ..." shape (see `persistCap` below), so matching that
// substring is enough to apply the danger tint without adding any new
// state — the plain success sentence falls through to the default,
// quieter `.status-line` tone.
function statusTone(message: string): string {
  return /failed/i.test(message) ? "status-line status-line--danger" : "status-line";
}

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

  // Visual-only, derived straight from the existing `cap`/`spend` props/
  // state — no new state. Per PRODUCT.md's "trust through transparency"
  // the spend figure itself carries the budget signal: comfortably under
  // cap reads `--success`, at/near/over cap reads `--danger`. Unlimited
  // (`cap === null`) has nothing to gauge against, so it stays neutral.
  const capRatio = cap === null ? null : cap === 0 ? (spend > 0 ? Infinity : 0) : spend / cap;
  const spendTone = capRatio === null ? "" : capRatio >= 0.8 ? "figure-lg--danger" : "figure-lg--success";

  return (
    <div className="config-page">
      <section>
        <h2>Budget cap</h2>
        <div className="field-row">
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
          <label className="checkbox-label">
            <input type="checkbox" checked={cap === null} onChange={(e) => handleCapChange(e.target.checked ? null : 0)} />
            Unlimited
          </label>
        </div>
        {status && (
          <p className={statusTone(status)} role="alert">
            {status}
          </p>
        )}
      </section>

      <section>
        <h2>This month</h2>
        <p className={`figure-lg data ${spendTone}`}>${spend.toFixed(2)}</p>
        <p className="status-line">
          {cap !== null ? `of $${cap.toFixed(2)} monthly cap (${currentMonth})` : `spent this month (${currentMonth})`}
        </p>
      </section>
    </div>
  );
}
