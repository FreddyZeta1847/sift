/**
 * The single Server Action the client-side health UI polls.
 *
 * Locally declared rather than re-exported: a "use server" file may only
 * export async functions, so `export { getModelHealth } from ...` is a
 * compile error — the same constraint documented in
 * app/config/api/actions.ts.
 *
 * Read-only by design. Nothing here starts a check: that happens exactly
 * twice in the app's life — once at process start (instrumentation.ts) and
 * again when the user reassigns a model (app/config/api/actions.ts). Letting
 * a poll trigger work would turn a 1.5s interval into a stream of billable
 * LLM calls.
 */
"use server";

import { getModelHealth } from "../../lib/health/model-health";
import type { HealthState } from "../../lib/health/types";

export async function getModelHealthStatus(): Promise<HealthState> {
  return getModelHealth();
}
