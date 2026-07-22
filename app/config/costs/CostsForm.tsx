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
 *
 * Visual pass only: "This month" gets a `.budget-bar` under the spend
 * figure, filled to `capRatio` (already computed below for the figure's own
 * success/danger tone) so the cap-vs-spend relationship is legible at a
 * glance instead of requiring the reader to compare two numbers themselves
 * — this page has very little else on it, and the bar earns its place per
 * PRODUCT.md's "trust through transparency" without reaching for a card
 * (see DESIGN.md's Card-Is-Not-Default Rule). Hidden when `cap` is null —
 * "unlimited" has nothing to fill a bar against.
 *
 * `dailySpend`/`spendByModel` back two additional read-only sections (no
 * new mutations): a per-day bar chart and a per-model breakdown. Per the
 * dataviz skill's form heuristic, day-by-day magnitude is a bar chart
 * (single series — Harbor Cobalt fill, no legend needed, the section title
 * names it); per-model spend is usually only 1-2 rows for a single
 * self-hoster's config, so it's a plain breakdown list rather than a second
 * chart (a categorical chart earns its keep at more categories than this
 * ever realistically has). The chart trims `dailySpend` to days that have
 * actually happened (today's UTC date and earlier) — the query always
 * returns a full month of buckets, and showing empty bars for future days
 * would misrepresent "no data yet" as "zero spend."
 */
"use client";

import { useState } from "react";
import { saveBudgetCap } from "./actions";
import type { DailySpend, ModelSpend } from "../../../lib/config/cost-history";

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
  dailySpend,
  spendByModel,
}: {
  budgetCapUsd: number | null;
  currentMonth: string;
  spend: number;
  dailySpend: DailySpend[];
  spendByModel: ModelSpend[];
}) {
  const [cap, setCap] = useState<number | null>(budgetCapUsd);
  const [status, setStatus] = useState<string | null>(null);

  const isCurrentMonth = currentMonth === new Date().toISOString().slice(0, 7);
  const todayUtcDate = new Date().getUTCDate();
  const visibleDays = isCurrentMonth ? dailySpend.filter((d) => d.day <= todayUtcDate) : dailySpend;
  const maxDayCost = Math.max(0, ...visibleDays.map((d) => d.cost));

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
      <div className="stage-grid">
      <section id="budget-cap" className="card">
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
            <span className="switch">
              <input type="checkbox" checked={cap === null} onChange={(e) => handleCapChange(e.target.checked ? null : 0)} />
              <span className="switch-track" />
            </span>
            Unlimited
          </label>
        </div>
        {status && (
          <p className={statusTone(status)} role="alert">
            {status}
          </p>
        )}
      </section>

      <section id="this-month" className="card">
        <h2>This month</h2>
        <p className={`figure-lg data ${spendTone}`}>${spend.toFixed(2)}</p>
        <p className="status-line">
          {cap !== null ? `of $${cap.toFixed(2)} monthly cap (${currentMonth})` : `spent this month (${currentMonth})`}
        </p>
        {cap !== null && (
          <div
            className="budget-bar"
            role="img"
            aria-label={`${Math.round(Math.min(capRatio ?? 0, 1) * 100)}% of monthly budget cap used`}
          >
            <div
              className="budget-bar-fill"
              data-tone={spendTone === "figure-lg--danger" ? "danger" : "success"}
              style={{ transform: `scaleX(${Math.min(capRatio ?? 0, 1)})` }}
            />
          </div>
        )}
      </section>
      </div>

      <div className="stage-grid">
      <section id="daily-spend" className="card">
        <h2>Daily spend</h2>
        {maxDayCost > 0 ? (
          <>
            <div
              className="bar-chart"
              role="img"
              aria-label={`Daily spend for ${currentMonth}. Peak day: $${maxDayCost.toFixed(2)}. See the table below for exact per-day figures.`}
            >
              {visibleDays.map((d) => (
                <div className="bar-chart-col" key={d.day} tabIndex={0}>
                  <div className="bar-chart-bar" style={{ transform: `scaleY(${maxDayCost > 0 ? d.cost / maxDayCost : 0})` }} />
                  <span className="bar-chart-tooltip">
                    Day {d.day}: ${d.cost.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            <table className="visually-hidden">
              <caption>Daily spend for {currentMonth}</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Spend (USD)</th>
                </tr>
              </thead>
              <tbody>
                {visibleDays.map((d) => (
                  <tr key={d.day}>
                    <td>{d.day}</td>
                    <td>${d.cost.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="empty-state">No spend recorded yet this month.</p>
        )}
      </section>

      <section id="by-model" className="card">
        <h2>By model</h2>
        {spendByModel.length > 0 ? (
          <ul className="list">
            {spendByModel.map((m) => (
              <li key={`${m.provider}-${m.model}`} className="list-row">
                <span className="list-row-main">
                  <span className="list-row-title data">{m.model}</span>
                  <span className="list-row-meta">
                    {m.provider} · {m.calls} call{m.calls === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="data">${m.cost.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No calls recorded yet this month.</p>
        )}
      </section>
      </div>
    </div>
  );
}
