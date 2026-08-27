/**
 * The vocabulary the model health check reports in.
 *
 * Types only, deliberately in their own file: the client-side provider that
 * renders these needs the shapes, but importing lib/health/model-health.ts
 * would drag probeModel -> callLLM -> @anthropic-ai/sdk into the browser
 * bundle. Mirrors how lib/config/types.ts is kept apart from its readers.
 *
 * WHY THIS IS NOT JUST ProbeResult
 * -------------------------------
 * A probe answers "what happened on the wire". A verdict answers "what
 * should the user be told". The split that matters is between a model that
 * is *broken* and a model we merely *stopped waiting for*:
 *
 *   "timeout"       the provider was given its full allowance and never
 *                   answered. Red. A real failure.
 *   "inconclusive"  our own (user-configurable) budget elapsed first. Grey.
 *                   We do not know, and must not guess — see the header of
 *                   lib/config/test-model-probe.ts for how this whole
 *                   distinction came about.
 *
 * Collapsing those two is precisely the bug this feature exists to prevent.
 *
 * Every field here must stay JSON-serializable — this state crosses the
 * server/client boundary, so epoch numbers, never Date objects.
 */
export type ModelVerdict = "ok" | "broken" | "timeout" | "inconclusive" | "unconfigured";

export type HealthOverall = "ok" | "problems" | "inconclusive" | "unconfigured";

export type HealthStage = "curation" | "drafting";

export interface StageHealth {
  stage: HealthStage;
  providerLabel: string | null;
  model: string | null;
  verdict: ModelVerdict;
  /** The sentence the banner renders. Written where the verdict is decided. */
  detail: string;
}

export interface ProbeUsage {
  providerId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface HealthCheckResult {
  overall: HealthOverall;
  stages: StageHealth[];
  /** What the check actually spent, so the caller can record it. */
  usage: ProbeUsage[];
}

export type HealthState =
  | { phase: "unknown" }
  | { phase: "checking"; startedAt: number }
  | { phase: "settled"; finishedAt: number; overall: HealthOverall; stages: StageHealth[] };
