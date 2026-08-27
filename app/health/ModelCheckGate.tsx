/**
 * The "testing models…" screen shown while the first check of a server
 * process is running.
 *
 * It covers the app so that nothing else is competing for attention while the
 * check runs — but it is a skip, never a block. "Use the app anyway" puts you
 * straight into a fully working app; only Run Now and the two Test buttons
 * stay locked, and only until the check answers or the 60s cap fires.
 *
 * That distinction is the whole design. A hard gate would hand a hung
 * provider the power to keep you out of the very Settings page where you
 * would go to fix it.
 *
 * Pure presentation — every decision about whether this renders at all lives
 * in ModelHealthProvider.
 */
"use client";

export function ModelCheckGate({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="model-gate" role="status" aria-live="polite">
      <div className="model-gate-card">
        <span className="model-gate-spinner" aria-hidden="true" />
        <h2 className="model-gate-title">Testing models…</h2>
        <p className="model-gate-text">
          Checking that the models assigned to curation and drafting are answering. This usually takes a few seconds.
        </p>
        <button className="model-gate-skip" onClick={onDismiss}>
          Use the app anyway
        </button>
        <p className="model-gate-note">
          The check keeps running either way. Run Now and the model tests unlock as soon as it finishes.
        </p>
      </div>
    </div>
  );
}
