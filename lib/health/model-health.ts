/**
 * The per-process model-health singleton: one check per server process, held
 * in memory, read synchronously by anything that renders.
 *
 * WHY IN MEMORY AND NOT PERSISTED
 * A probe result is only true for *this* process's network and credentials.
 * Writing it to settings or the database would mean showing a green tick from
 * last Tuesday after a key expired this morning. Per-process is the correct
 * scope, not merely the convenient one — which is also why this deliberately
 * mirrors lib/scheduler/init.ts's module-level flag rather than inventing
 * anything new.
 *
 * WHY startModelHealthCheck RETURNS void, NOT Promise<void>
 * This is started from instrumentation.ts's register(), which Next.js awaits
 * before it serves a single HTTP request. On 2026-08-27 exactly that path
 * hung localhost:3000 for the length of a whole pipeline run (see
 * ~/.claude/issues/013 and the comment in lib/scheduler/catchup.ts). That fix
 * relies on the caller remembering `void` and `.catch()`; this one puts the
 * guarantee in the type system instead. There is no promise here to await
 * even by accident, and the mandatory .catch() lives inside, where it cannot
 * be forgotten — an unhandled rejection would kill the very server the
 * detached work is meant to keep running.
 *
 * The check never fails loudly. Anything unexpected settles as
 * "inconclusive", because a bug in a health check must never be able to brick
 * the app it is reporting on.
 */
import { getSettings as defaultGetSettings } from "../config/settings";
import { checkAssignedModels } from "./check-models";
import type { Settings } from "../config/types";
import type { HealthCheckResult, HealthState, StageHealth } from "./types";

export interface HealthDeps {
  getSettings: () => Promise<Settings>;
  check: () => Promise<HealthCheckResult>;
}

const DEFAULT_DEPS: HealthDeps = {
  getSettings: defaultGetSettings,
  check: () => checkAssignedModels(),
};

let state: HealthState = { phase: "unknown" };
// Guards re-entry synchronously. A promise-based guard would let two calls in
// the same tick both slip through and pay for the same probes twice.
let inFlight = false;

export function getModelHealth(): HealthState {
  return state;
}

export function startModelHealthCheck(deps: HealthDeps = DEFAULT_DEPS): void {
  if (inFlight) return;
  inFlight = true;
  state = { phase: "checking", startedAt: Date.now() };

  void run(deps)
    .catch((err: unknown) => {
      // Reached only if the guarded body below somehow throws anyway. Settle
      // rather than rethrow: see the header on why this must never escape.
      // eslint-disable-next-line no-console
      console.error(`[sift] Model health check failed: ${(err as Error).message}`);
      state = settledFrom(inconclusiveResult("The model check could not be completed."));
    })
    .finally(() => {
      inFlight = false;
    });
}

export function invalidateModelHealth(): void {
  state = { phase: "unknown" };
}

export function __resetForTests(): void {
  state = { phase: "unknown" };
  inFlight = false;
}

async function run(deps: HealthDeps): Promise<void> {
  const settings = await deps.getSettings();
  if (!settings.modelHealthCheckEnabled) {
    // Switched off: no calls, no spend, and — because "unknown" is the
    // never-gate phase — no startup screen and no locked buttons either.
    state = { phase: "unknown" };
    return;
  }

  try {
    state = settledFrom(await deps.check());
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[sift] Model health check failed: ${(err as Error).message}`);
    state = settledFrom(inconclusiveResult("The model check could not be completed."));
  }
}

function settledFrom(result: HealthCheckResult): HealthState {
  return { phase: "settled", finishedAt: Date.now(), overall: result.overall, stages: result.stages };
}

function inconclusiveResult(detail: string): HealthCheckResult {
  const stages: StageHealth[] = (["curation", "drafting"] as const).map((stage) => ({
    stage,
    providerLabel: null,
    model: null,
    verdict: "inconclusive",
    detail,
  }));
  return { overall: "inconclusive", stages, usage: [] };
}
