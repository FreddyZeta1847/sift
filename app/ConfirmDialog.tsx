/**
 * The one "are you sure?" dialog, used by every destructive action in the
 * app.
 *
 * WHAT IT REPLACES
 * Two opposite problems, both of them inconsistency:
 *   - The four Admin tables called `window.confirm()`. That popup is the
 *     browser's, not the app's: system font, system colors, an OS dialog
 *     dropped on top of a warm sand page. It also blocks the whole tab
 *     while it is open.
 *   - Delete provider, Remove model and the voice-profile chip Remove had
 *     no confirmation at all. Same class of action, opposite treatment,
 *     decided per-list rather than by any rule.
 *
 * So: every delete now asks, and every delete asks the same way.
 *
 * WHY IT WRAPS Modal RATHER THAN REIMPLEMENTING ONE
 * Modal.tsx already solves the hard parts — portalling to <body> so a
 * `position: fixed` card can't be trapped by an ancestor's transform,
 * trapping Tab, restoring focus on close, and dismissing on a backdrop
 * click only when the press *and* release both land on the backdrop. A
 * second overlay would have to solve all of that again, and would drift.
 *
 * The confirm button is `.danger` (ghost, red text) rather than a filled
 * red button, per DESIGN.md §5: a filled red button reads as an alarm, and
 * deleting one row of a local tool is not an alarm.
 */
"use client";

import { useState } from "react";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  title: string;
  /** What will happen, and whether it can be undone. A full sentence. */
  message: React.ReactNode;
  /** Label for the confirming action. Name the verb — "Delete", not "OK". */
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // A delete that hits the network can take a moment. Without this the
  // dialog sits there looking ignored, and an impatient second click
  // fires the action twice.
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="danger" onClick={handleConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}
