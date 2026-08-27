/**
 * The result banner, shown once the model check settles.
 *
 * Four tones, and the reason there are four rather than two is the point of
 * the whole feature:
 *
 *   ok            green   — both models answered correctly.
 *   problems      red     — something is genuinely wrong, and the per-stage
 *                           detail says what and where.
 *   inconclusive  MUTED   — the check stopped waiting. NOT red, because
 *                           "slower than the limit you set" is not a failure,
 *                           and colouring it like one is precisely the false
 *                           alarm this feature was built to stop.
 *   unconfigured  muted   — nothing assigned yet; a fresh install, not a
 *                           fault.
 *
 * The sentences come from lib/health/check-models.ts, written next to the
 * decision that produced them. This component picks a tone and lays them out;
 * it never decides what a verdict means.
 *
 * A clean result dismisses itself — "everything is fine" earns a glance, not
 * permanent screen space. Anything else stays until the user closes it.
 */
"use client";

import { useEffect } from "react";
import type { HealthOverall, StageHealth } from "../../lib/health/types";

const CLEAN_BANNER_MS = 6000;

const HEADLINES: Record<HealthOverall, string> = {
  ok: "All models are responding.",
  problems: "A model needs attention.",
  inconclusive: "Model check didn't finish.",
  unconfigured: "No models assigned yet.",
};

const TONES: Record<HealthOverall, string> = {
  ok: "model-banner model-banner--ok",
  problems: "model-banner model-banner--problem",
  inconclusive: "model-banner model-banner--muted",
  unconfigured: "model-banner model-banner--muted",
};

export function ModelHealthBanner({
  overall,
  stages,
  onDismiss,
}: {
  overall: HealthOverall;
  stages: StageHealth[];
  onDismiss: () => void;
}) {
  const selfDismissing = overall === "ok";

  useEffect(() => {
    if (!selfDismissing) return;
    const timer = setTimeout(onDismiss, CLEAN_BANNER_MS);
    return () => clearTimeout(timer);
  }, [selfDismissing, onDismiss]);

  // On a clean result the per-stage sentences say nothing the headline
  // doesn't. They earn their space only when something needs acting on.
  const details = overall === "ok" ? [] : stages.filter((s) => s.verdict !== "ok");

  return (
    <div className={TONES[overall]} role="status">
      <div className="model-banner-body">
        <strong>{HEADLINES[overall]}</strong>
        {details.map((s) => (
          <span key={s.stage} className="model-banner-detail">
            {s.detail}
          </span>
        ))}
      </div>
      <button className="model-banner-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
