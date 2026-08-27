/**
 * The one overlay card used by every "add" and "edit" flow in the app
 * (add provider, add model, edit prices, add source).
 *
 * Replaces a pattern where each list grew its form inline: the list shifted
 * down, four fields had to fit the width of a row, and two lists could sit
 * half-expanded at once. A form that interrupts is easier to read and easier
 * to abandon than a form that unfolds.
 *
 * Deliberately borrows the health gate's visual language (fixed overlay,
 * tinted blurred backdrop, raised card) so the app has ONE overlay look
 * rather than two that nearly match.
 *
 * WHY A PORTAL
 * `position: fixed` is relative to the nearest ancestor with a transform,
 * filter or backdrop-filter, not to the viewport. This card is opened from
 * deep inside pages that use all three, so rendering in place would sooner or
 * later trap it inside a section. Portalling to <body> makes that
 * structurally impossible instead of a bug waiting to happen.
 *
 * ACCESSIBILITY, AND WHY IT IS NOT OPTIONAL HERE
 * An overlay that does not manage focus is worse than the inline form it
 * replaced: a keyboard user tabs from the card into the page behind it, where
 * everything is still focusable but visually covered. So this traps Tab
 * inside the card, moves focus in on open, returns it to whatever opened the
 * modal on close, and closes on Escape.
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  /** Optional sentence under the title explaining what this form is for. */
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  /** The action buttons. Rendered in a footer row, right-aligned. */
  footer: React.ReactNode;
}

export function Modal({ title, description, onClose, children, footer }: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  // Portals need the DOM, so the first render (including SSR) produces
  // nothing. Harmless: a modal is closed until someone opens it.
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const focusables = useCallback((): HTMLElement[] => {
    return Array.from(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    focusables()[0]?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      // Returning focus is what makes "open, cancel, carry on" work for a
      // keyboard user — otherwise focus resets to the top of the document.
      previouslyFocused?.focus?.();
    };
  }, [mounted, focusables]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];

    // Wrap at both ends so Tab can never reach the page behind the overlay.
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      // Only a click that both starts and ends on the backdrop counts, so a
      // drag that begins inside the card and releases outside it does not
      // throw away what the user just typed.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title} ref={cardRef}>
        <div className="modal-head">
          <h3 className="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {description && <p className="modal-description">{description}</p>}
        <div className="modal-body">{children}</div>
        <div className="modal-footer">{footer}</div>
      </div>
    </div>,
    document.body
  );
}
