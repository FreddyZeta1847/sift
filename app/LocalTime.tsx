/**
 * A timestamp rendered in the viewer's own locale and timezone, without
 * causing a React hydration mismatch.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * `toLocaleString(undefined, …)` reads the *runtime's* default locale and
 * timezone. Inside a Client Component that is two different runtimes: Node
 * during SSR, then the browser during hydration. They disagree, and React
 * throws:
 *
 *     server: 27/08/2026, 23:27
 *     client: 08/27/2026, 11:27 PM
 *
 * Same instant, different locale — en-GB's 24-hour day-first against
 * en-US's 12-hour month-first. A different server timezone (a Docker
 * image defaulting to UTC, say) breaks it the same way for a second
 * reason. This is the identical failure documented at length in
 * app/review/RunPicker.tsx's header, which notes it "bit us once already";
 * three Admin tables and the Posted feed each carried their own copy of
 * the offending call.
 *
 * THE FIX
 * RunPicker solves it by pinning locale and timezone outright, which is
 * right for that control: its labels are relative ("today 06:00") and a
 * pipeline run's schedule is defined in UTC anyway. It is the wrong trade
 * here — these are timestamps you read to work out when something
 * happened, and the honest answer is in your own clock, not the server's.
 *
 * So: render a fixed, unambiguous UTC string on the server AND on the
 * first client render — identical by construction, so hydration matches —
 * then swap to the viewer's own formatting in an effect, which runs after
 * hydration and is therefore allowed to differ. The visible result is an
 * ISO-ish timestamp for one frame, then local time.
 *
 * `suppressHydrationWarning` is deliberately NOT used. It would silence
 * the warning while leaving the mismatch, which is the thing that
 * actually corrupts the tree.
 */
"use client";

import { useEffect, useState } from "react";

/**
 * Deterministic everywhere: fixed locale, fixed timezone, fixed field
 * widths. This is what the server renders and what the client renders
 * before it knows better.
 */
function stableUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    ` ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

/** Numeric and compact, for a column of timestamps that should align. */
export const NUMERIC: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
};

/** Wordier, for a timestamp read as prose rather than scanned in a column. */
export const READABLE: Intl.DateTimeFormatOptions = {
  dateStyle: "medium",
  timeStyle: "short",
};

interface LocalTimeProps {
  value: Date | string | null;
  /** Shown when `value` is null. */
  fallback?: string;
  options?: Intl.DateTimeFormatOptions;
  className?: string;
}

export function LocalTime({ value, fallback = "—", options = NUMERIC, className }: LocalTimeProps) {
  const [localized, setLocalized] = useState<string | null>(null);

  useEffect(() => {
    if (value === null) return;
    setLocalized(new Date(value).toLocaleString(undefined, options));
    // `options` is a module-level constant at every call site, so it is
    // stable by reference; JSON-keying it would only matter for an inline
    // object literal, which no caller passes.
  }, [value, options]);

  if (value === null) return <>{fallback}</>;

  const text = localized ?? stableUtc(new Date(value));
  return className ? <span className={className}>{text}</span> : <>{text}</>;
}
