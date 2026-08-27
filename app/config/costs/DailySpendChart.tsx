/**
 * Daily spend for the current month, as a line.
 *
 * WHY A LINE AND NOT THE BARS IT REPLACES
 * Spend day-by-day is a quantity changing over time, and the question you
 * bring to it is "is this trending up?" — not "which single day was
 * biggest?". Bars answer the second question and make the first one work:
 * a reader has to trace the tops themselves. A line draws that trend
 * directly. (Bars would still be right if the days were unordered
 * categories, which they are not.)
 *
 * ONE SERIES, SO NO LEGEND
 * There is nothing to tell apart, and the panel title already names what
 * is plotted. A legend here would be a box that says one thing.
 *
 * LABELS ARE SELECTIVE, NOT UNIVERSAL
 * A number on every point is chaos and goes unread. Only the peak day is
 * labelled directly, because it is the one value you look for without
 * hovering; the axis carries the scale and the tooltip carries the rest.
 *
 * THE TOOLTIP IS NEVER THE ONLY WAY TO READ A VALUE
 * Every figure is also in the visually-hidden table this component's
 * caller renders — the WCAG-clean twin of the same data. Hover enhances,
 * it does not gate. Each day also gets a focusable hit area so a keyboard
 * shows exactly what a pointer does, matching the behaviour of the bar
 * chart this replaces.
 *
 * SIZING
 * The SVG scales to its container via `viewBox` + `width: 100%`, and every
 * stroke carries `vector-effect="non-scaling-stroke"` so lines stay the
 * width they were specified at instead of thickening as the panel widens.
 * The viewBox height includes the x-axis band, so the axis labels can
 * never be the thing that gets clipped.
 */
"use client";

import { useState } from "react";
import type { DailySpend } from "../../../lib/config/cost-history";

const W = 720;
const H = 210;
const PAD = { top: 14, right: 16, bottom: 28, left: 52 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const GRID_LINES = 4;

/**
 * Round an axis maximum up to a readable number, so ticks land on values a
 * person would choose (0.5, 2, 50) rather than on $1.37.
 */
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** A tick label: cents when the whole month is small, dollars otherwise. */
function formatTick(value: number, max: number): string {
  if (value === 0) return "$0";
  return max < 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(max < 10 ? 1 : 0)}`;
}

export function DailySpendChart({ days, month }: { days: DailySpend[]; month: string }) {
  const [hovered, setHovered] = useState<number | null>(null);

  const max = niceCeil(Math.max(...days.map((d) => d.cost)));
  const peakIndex = days.reduce((best, d, i) => (d.cost > days[best].cost ? i : best), 0);

  // A single day has no line to draw, so it is plotted at the middle of the
  // plot rather than at x=0 where it would sit on the y-axis.
  const x = (i: number) => (days.length === 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (days.length - 1)) * PLOT_W);
  const y = (cost: number) => PAD.top + PLOT_H - (cost / max) * PLOT_H;

  const points = days.map((d, i) => `${x(i)},${y(d.cost)}`).join(" ");
  const areaPath =
    days.length > 1
      ? `M ${x(0)},${PAD.top + PLOT_H} L ${points.split(" ").join(" L ")} L ${x(days.length - 1)},${PAD.top + PLOT_H} Z`
      : "";

  // Hit areas are bands centred on each point, so the target is the whole
  // column rather than the 2px line itself. At a month's width that is
  // roughly 21px per day on a 720-unit viewBox, which scales up past the
  // 24px minimum on any real panel width.
  const band = days.length > 1 ? PLOT_W / (days.length - 1) : PLOT_W;

  const active = hovered !== null ? days[hovered] : null;

  // The peak label normally sits above its point, but a peak at the very
  // top of the scale would put the text outside the viewBox, where it is
  // silently clipped. Flip it below the point in that case.
  const peakY = y(days[peakIndex].cost);
  const peakLabelY = peakY < PAD.top + 14 ? peakY + 18 : peakY - 12;

  return (
    <div className="line-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="line-chart-svg"
        role="img"
        aria-label={`Daily spend for ${month}. Peak day: day ${days[peakIndex].day} at $${days[peakIndex].cost.toFixed(2)}. See the table below for exact per-day figures.`}
        onPointerLeave={() => setHovered(null)}
      >
        {/* Solid hairlines, one shade off the surface — a dashed grid reads
            as a threshold or a projection when it is neither. */}
        {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
          const value = (max / GRID_LINES) * i;
          const gy = y(value);
          return (
            <g key={i}>
              <line
                x1={PAD.left}
                y1={gy}
                x2={W - PAD.right}
                y2={gy}
                className="line-chart-grid"
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 10} y={gy + 4} className="line-chart-tick" textAnchor="end">
                {formatTick(value, max)}
              </text>
            </g>
          );
        })}

        {days.length > 1 && <path d={areaPath} className="line-chart-area" />}

        {days.length > 1 ? (
          <polyline
            points={points}
            className="line-chart-line"
            vectorEffect="non-scaling-stroke"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : (
          <circle cx={x(0)} cy={y(days[0].cost)} r="5" className="line-chart-point" />
        )}

        {/* The extreme, labelled directly — the one value worth reading
            without hovering for it. */}
        {days[peakIndex].cost > 0 && (
          <>
            <circle cx={x(peakIndex)} cy={y(days[peakIndex].cost)} r="4.5" className="line-chart-point" />
            <text
              x={x(peakIndex)}
              y={peakLabelY}
              className="line-chart-peak-label"
              textAnchor={peakIndex > days.length / 2 ? "end" : "start"}
            >
              ${days[peakIndex].cost.toFixed(2)}
            </text>
          </>
        )}

        {/* First and last day only. A tick under all 31 would collide. */}
        <text x={PAD.left} y={H - 8} className="line-chart-tick" textAnchor="start">
          {days[0].day}
        </text>
        {days.length > 1 && (
          <text x={W - PAD.right} y={H - 8} className="line-chart-tick" textAnchor="end">
            {days[days.length - 1].day}
          </text>
        )}

        {hovered !== null && (
          <>
            <line
              x1={x(hovered)}
              y1={PAD.top}
              x2={x(hovered)}
              y2={PAD.top + PLOT_H}
              className="line-chart-crosshair"
              vectorEffect="non-scaling-stroke"
            />
            {/* A 2px surface ring, not a border, so the marker reads as
                sitting above the line rather than being outlined. */}
            <circle cx={x(hovered)} cy={y(days[hovered].cost)} r="5" className="line-chart-marker" />
          </>
        )}

        {days.map((d, i) => (
          <rect
            key={d.day}
            x={Math.max(PAD.left, x(i) - band / 2)}
            y={PAD.top}
            width={Math.min(band, W - PAD.right - Math.max(PAD.left, x(i) - band / 2))}
            height={PLOT_H}
            fill="transparent"
            tabIndex={0}
            className="line-chart-hit"
            onPointerEnter={() => setHovered(i)}
            onFocus={() => setHovered(i)}
            onBlur={() => setHovered(null)}
          >
            <title>{`Day ${d.day}: $${d.cost.toFixed(2)}`}</title>
          </rect>
        ))}
      </svg>

      {active && (
        <div
          className="line-chart-tooltip"
          style={{
            left: `${(x(hovered as number) / W) * 100}%`,
            // Flip the anchor near the right edge so the bubble stays inside
            // the panel instead of forcing a horizontal scrollbar.
            transform: (hovered as number) > days.length / 2 ? "translateX(-100%)" : "none",
          }}
        >
          <span className="line-chart-tooltip-day">Day {active.day}</span>
          <span className="data">${active.cost.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
