/**
 * Interactive form for the Costs page (`/config/costs`).
 *
 * THREE ROWS, IN THE ORDER THE QUESTIONS ARRIVE
 *   1. This month, and the cap it is measured against — side by side,
 *      because neither number means much without the other. They used to
 *      sit in that order reversed, so the page opened with a form field
 *      rather than with the figure the page exists to show.
 *   2. Daily spend, full width — a shape needs room to be a shape.
 *   3. By model and Model checking, side by side — both are breakdowns of
 *      the total above, and both are short.
 *
 * Client Component. The budget cap field follows the exact same
 * optimistic-update-with-rollback pattern established (and reviewer-fixed)
 * for retention in `app/config/settings/SettingsForm.tsx`: local `useState`
 * seeded from `budgetCapUsd`, paired with an "unlimited" switch (checked
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
 * "This month" carries a `.budget-bar` under the spend figure, filled to
 * `capRatio` (already computed below for the figure's own success/danger
 * tone) so the cap-vs-spend relationship is legible at a glance instead of
 * requiring the reader to compare two numbers themselves. Hidden when `cap`
 * is null — "unlimited" has nothing to fill a bar against.
 *
 * `dailySpend` is drawn as a line rather than the bars it used to be: the
 * question you bring to spend-over-time is whether it is trending up, and
 * bars make a reader trace their own tops to answer that. See
 * DailySpendChart.tsx. `spendByModel` stays a plain breakdown list — for a
 * single self-hoster it is usually one or two rows, and a categorical chart
 * earns its keep at more categories than this realistically has.
 *
 * The chart trims `dailySpend` to days that have actually happened (today's
 * UTC date and earlier): the query always returns a full month of buckets,
 * and plotting the future at zero would misrepresent "no data yet" as
 * "nothing spent".
 */
"use client";

import { useState } from "react";
import { saveBudgetCap } from "./actions";
import { StatusMessage } from "../../StatusMessage";
import { EmptyState } from "../../EmptyState";
import { DailySpendChart } from "./DailySpendChart";
import type { DailySpend, ModelSpend, CheckSpend } from "../../../lib/config/cost-history";

export function CostsForm({
  budgetCapUsd,
  currentMonth,
  spend,
  dailySpend,
  spendByModel,
  checkSpend,
}: {
  budgetCapUsd: number | null;
  currentMonth: string;
  spend: number;
  dailySpend: DailySpend[];
  spendByModel: ModelSpend[];
  checkSpend: CheckSpend;
}) {
  const [cap, setCap] = useState<number | null>(budgetCapUsd);
  // Carries its own tone rather than having it inferred from the wording:
  // this component knows whether the save worked.
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const isCurrentMonth = currentMonth === new Date().toISOString().slice(0, 7);
  const todayUtcDate = new Date().getUTCDate();
  const visibleDays = isCurrentMonth ? dailySpend.filter((d) => d.day <= todayUtcDate) : dailySpend;
  const maxDayCost = Math.max(0, ...visibleDays.map((d) => d.cost));

  const persistCap = async (value: number | null, previous: number | null) => {
    const result = await saveBudgetCap(value);
    if (!result.ok) {
      setCap(previous);
      setStatus({ text: `Save failed: ${result.error}`, ok: false });
      return;
    }
    setStatus({ text: "Budget cap saved.", ok: true });
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
      <div className="panel-grid">
        <section className="panel" id="this-month">
          <div className="panel-head">
            <h2>This month</h2>
          </div>
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

        <section className="panel" id="budget-cap">
          <div className="panel-head">
            <h2>Budget cap</h2>
          </div>
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
          <StatusMessage message={status?.text} tone={status?.ok ? "success" : "danger"} />
        </section>
      </div>

      <section className="panel" id="daily-spend">
        <div className="panel-head">
          <h2>Daily spend</h2>
          {maxDayCost > 0 && <span className="panel-head-aside data">{currentMonth}</span>}
        </div>
        {maxDayCost > 0 ? (
          <>
            <DailySpendChart days={visibleDays} month={currentMonth} />
            {/* The chart's WCAG-clean twin. Every value the tooltip shows is
                also here, so hovering is never the only way to read one. */}
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
          <EmptyState hint="Spend appears here as soon as a run makes its first billed call.">
            No spend recorded yet this month.
          </EmptyState>
        )}
      </section>

      <div className="panel-grid">
        <section className="panel" id="by-model">
          <div className="panel-head">
            <h2>By model</h2>
          </div>
          {spendByModel.length > 0 ? (
            <div className="rows" style={{ ["--cols" as string]: "minmax(0,1fr) auto" } as React.CSSProperties}>
              {spendByModel.map((m) => (
                <div key={`${m.provider}-${m.model}`} className="row">
                  <span className="row-main">
                    <span className="row-title data">{m.model}</span>
                    <span className="row-meta">
                      {m.provider} · {m.calls} call{m.calls === 1 ? "" : "s"}
                    </span>
                  </span>
                  {m.priced ? (
                    <span className="data">${m.cost.toFixed(2)}</span>
                  ) : (
                    /* $0.00 here would be a confident lie. This model has no
                       price on record, so its real spend is unknown — and it is
                       invisible to the budget cap for the same reason. Add it in
                       Models & pricing on API Config to start counting it. */
                    <span
                      className="data status-line"
                      title="No price on record for this model, so its spend can't be worked out and isn't counted against your budget cap. Add it in Models & pricing on API Config."
                    >
                      pricing not set
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState hint="Every pipeline call is recorded here, grouped by the model that made it.">
              No calls recorded yet this month.
            </EmptyState>
          )}
        </section>

        <section className="panel" id="check-spend">
          <div className="panel-head">
            <h2>Model checking</h2>
          </div>
          <p className="panel-intro">
            What the startup check and the &ldquo;Test this model&rdquo; button cost this month. Counted separately from
            pipeline runs because they answer a different question — but it is the same money, and it counts against your
            budget cap.
          </p>
          {checkSpend.calls > 0 ? (
            <p>
              <span className="data">${checkSpend.cost.toFixed(2)}</span> across {checkSpend.calls} call
              {checkSpend.calls === 1 ? "" : "s"}
            </p>
          ) : (
            <EmptyState hint="Nothing has been spent checking models — either checking is off, or no check has run yet.">
              No model checks recorded yet this month.
            </EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}
