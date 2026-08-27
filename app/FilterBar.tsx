/**
 * The filter control shared by the four Admin tables (Runs, Candidates,
 * Posts, LLM Calls).
 *
 * WHAT CHANGED, AND WHY
 * Each table used to open with a permanently-visible row of four or five
 * inputs. That row is the first thing on the page and the least often
 * used thing on it: most visits are "show me the last few runs", not "find
 * run #418". Four heavy input boxes above every table, on every visit, to
 * serve the rarer case.
 *
 * So the fields fold behind one "Filters" button, and the *state* of the
 * filtering — which is the part you actually need at a glance — stays
 * visible as a row of removable chips. Nothing is removed: every field,
 * every option and every commit rule is the same as before. You just don't
 * look at an empty form when you aren't filtering.
 *
 * COMMIT RULES ARE PRESERVED DELIBERATELY
 * Free-text and number fields commit on blur; selects and dates commit on
 * change. That split isn't arbitrary — pushing a new URL on every
 * keystroke of a search box would refetch the table per character.
 *
 * The panel expands inline rather than floating as a popover: a popover
 * anchored above a wide scrolling table has to solve clipping and
 * outside-click dismissal, and buys nothing here, since there is nothing
 * underneath it worth keeping visible while you type.
 */
"use client";

import { useState } from "react";

export type FilterField =
  | { key: string; label: string; kind: "text"; placeholder?: string }
  | { key: string; label: string; kind: "number" }
  | { key: string; label: string; kind: "date" }
  | {
      key: string;
      label: string;
      kind: "select";
      /** The first option is the "no filter" one and must use value "". */
      options: { value: string; label: string }[];
    };

export type FilterValues = Record<string, string | undefined>;

interface FilterBarProps {
  fields: FilterField[];
  values: FilterValues;
  /** Called with the complete next filter map. Empty strings mean "unset". */
  onChange: (next: FilterValues) => void;
}

/** How an active filter reads on its chip — the option's label, not its raw value. */
function chipText(field: FilterField, value: string): string {
  if (field.kind === "select") {
    const match = field.options.find((o) => o.value === value);
    return `${field.label}: ${match?.label ?? value}`;
  }
  return `${field.label}: ${value}`;
}

export function FilterBar({ fields, values, onChange }: FilterBarProps) {
  const active = fields.filter((f) => {
    const v = values[f.key];
    return v !== undefined && v !== "";
  });
  // Opens already expanded when filters are in force, so arriving on a
  // filtered URL (a shared link, a back-navigation) doesn't hide the
  // controls that produced what you're looking at.
  const [open, setOpen] = useState(active.length > 0);

  const set = (key: string, value: string) => onChange({ ...values, [key]: value });
  const clearAll = () => onChange(Object.fromEntries(fields.map((f) => [f.key, ""])));

  return (
    <div className="filter-bar">
      <div className="filter-bar-head">
        <button
          type="button"
          className={open ? "filter-toggle is-open" : "filter-toggle"}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filters
          {active.length > 0 && <span className="filter-count">{active.length}</span>}
        </button>

        {active.length > 0 && (
          <div className="filter-chips">
            {active.map((f) => (
              <button
                key={f.key}
                type="button"
                className="filter-chip"
                onClick={() => set(f.key, "")}
                aria-label={`Remove filter ${chipText(f, values[f.key] as string)}`}
              >
                {chipText(f, values[f.key] as string)}
                <span aria-hidden="true">×</span>
              </button>
            ))}
            <button type="button" className="filter-clear" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="filter-fields">
          {fields.map((field) => (
            <FilterInput
              key={`${field.key}:${values[field.key] ?? ""}`}
              field={field}
              value={values[field.key] ?? ""}
              onCommit={(v) => set(field.key, v)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One field. Keyed on its committed value by the parent, so it resyncs
 * whenever the URL changes underneath it (back button, a chip removed) —
 * the same trick the old inline filter rows used.
 */
function FilterInput({
  field,
  value,
  onCommit,
}: {
  field: FilterField;
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  if (field.kind === "select") {
    return (
      <label>
        {field.label}
        <select value={value} onChange={(e) => onCommit(e.target.value)}>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // Dates commit immediately: a date picker has no meaningful "still
  // typing" state to wait out.
  const commitOnChange = field.kind === "date";

  return (
    <label>
      {field.label}
      <input
        type={field.kind === "number" ? "number" : field.kind === "date" ? "date" : "text"}
        placeholder={field.kind === "text" ? field.placeholder : undefined}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (commitOnChange) onCommit(e.target.value);
        }}
        onBlur={() => {
          if (!commitOnChange && draft !== value) onCommit(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !commitOnChange) {
            e.preventDefault();
            onCommit(draft);
          }
        }}
      />
    </label>
  );
}
