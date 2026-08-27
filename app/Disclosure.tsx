/**
 * A one-line toggle that folds something secondary away without deleting
 * it — a draft's image prompt, a settings panel's explanatory paragraphs.
 *
 * The rule this encodes: content is never removed to make a page calmer,
 * only folded. Everything that was on screen before is still on screen,
 * one click away, with its wording untouched. If something genuinely
 * shouldn't be there, delete it in the source — don't hide it here.
 *
 * Uses a button + conditional render rather than the native
 * <details>/<summary> pair, because <summary>'s default marker and its
 * baked-in layout fight the app's own caret and spacing, and suppressing
 * them cross-browser costs more than this does.
 */
"use client";

import { useId, useState } from "react";

interface DisclosureProps {
  /** The always-visible line. Say what is behind the fold, not "More". */
  label: string;
  /** Open on first render — for a disclosure whose content is usually wanted. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Disclosure({ label, defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div>
      <button
        type="button"
        className="disclosure-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className="disclosure-caret"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="9 6 15 12 9 18" />
        </svg>
        {label}
      </button>
      {open && (
        <div className="disclosure-panel" id={panelId}>
          {children}
        </div>
      )}
    </div>
  );
}
