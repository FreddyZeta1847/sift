/**
 * "Test this model" probe used by the API Config page (`/config/api`) and by
 * the startup model health check (lib/health/).
 *
 * Sends a minimal structured-output request through the same `callLLM` path
 * the pipeline itself uses (lib/llm/provider.ts), so the probe result
 * reflects what Curation Engine/Draft Generator would experience with this
 * provider+model pair.
 *
 * FIVE OUTCOMES. The important pair is the last two, which this module used
 * to have exactly backwards:
 *
 *   - "pass":         the model returned parseable JSON — good to assign.
 *   - "fail":         the call succeeded but the model didn't follow the
 *                     structured-output instruction (see the capability-floor
 *                     note in provider.ts) — the model itself is the problem.
 *   - "unreachable":  the call threw for a non-timeout reason (bad
 *                     credentials, bad baseUrl, non-2xx) — the config is the
 *                     problem.
 *   - "timeout":      the PROVIDER was given its full LLM_TIMEOUT_MS and did
 *                     not respond. A real failure, and worth saying plainly.
 *   - "inconclusive": WE stopped waiting, because this probe's own budget
 *                     elapsed first. The call may well have succeeded — we do
 *                     not know, and must not pretend otherwise.
 *
 * Why the split matters: the old code returned "timeout" when its own 30s
 * race fired, and "unreachable" when the provider genuinely timed out. Both
 * words pointed at the wrong thing, so a user reading "timeout" could not
 * tell whether their model was dead or merely slower than an arbitrary
 * number chosen here. Now "timeout" always means the provider, and anything
 * caused by our own impatience is reported as "inconclusive" — never as a
 * failure, and never in red.
 *
 * DEFAULT_TIMEOUT_MS is a fallback for callers that do not pass a budget.
 * The real budgets are user-configurable (Settings): a short one for the
 * automatic startup check, a longer one for this button. Both are passed in
 * explicitly by their callers.
 *
 * PROBE_MAX_OUTPUT_TOKENS was originally 20 — enough for a non-reasoning
 * model to echo `{"ok": true}`, but a real observed case with a reasoning
 * model (Gemini's gemini-flash-latest) spent the entire 20-token budget on
 * hidden reasoning and returned a response with no `content` field at all
 * (`finish_reason: "length"`, `completion_tokens: 0`) — a real, working
 * model and key, reported as "unreachable" purely because the budget was too
 * small for this model class to say anything visible at all. 200 gives real
 * reasoning models room to finish their hidden reasoning and still emit the
 * tiny visible answer this probe actually checks for.
 */
import { callLLM, isLlmTimeoutError } from "../llm/provider";
import type { Provider } from "./types";

export type ProbeResult = "pass" | "fail" | "unreachable" | "timeout" | "inconclusive";

export const DEFAULT_TIMEOUT_MS = 60_000;
const PROBE_MAX_OUTPUT_TOKENS = 200;

export interface ProbeOutcome {
  result: ProbeResult;
  inputTokens: number;
  outputTokens: number;
}

// Tokens are reported alongside the verdict because a probe is a real,
// billable LLM call. Callers record it so probe spend stops being invisible
// (see lib/llm/non-pipeline-calls.ts). A call that never returned reports
// zero usage rather than guessing.
export async function probeModelWithUsage(
  provider: Provider,
  model: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ProbeOutcome> {
  const ourBudgetElapsed = new Promise<ProbeOutcome>((resolve) =>
    setTimeout(() => resolve({ result: "inconclusive", inputTokens: 0, outputTokens: 0 }), timeoutMs)
  );
  return Promise.race([runProbe(provider, model), ourBudgetElapsed]);
}

export async function probeModel(
  provider: Provider,
  model: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<ProbeResult> {
  const { result } = await probeModelWithUsage(provider, model, timeoutMs);
  return result;
}

async function runProbe(provider: Provider, model: string): Promise<ProbeOutcome> {
  try {
    const response = await callLLM(
      provider,
      model,
      [{ role: "user", content: 'Respond with ONLY this exact JSON: {"ok": true}' }],
      { maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS }
    );
    return {
      result: verdictFor(response.content),
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    };
  } catch (err) {
    return { result: verdictForThrown(err), inputTokens: 0, outputTokens: 0 };
  }
}

// A model that responds but produces no usable text (missing/empty content —
// e.g. a reasoning model that ran out of budget before any visible output) is
// the same class of problem as invalid JSON: the model itself is the issue,
// not connectivity or credentials.
function verdictFor(content: string | undefined): ProbeResult {
  if (!content || typeof content !== "string" || content.trim().length === 0) return "fail";
  try {
    JSON.parse(content.trim());
    return "pass";
  } catch {
    return "fail";
  }
}

function verdictForThrown(err: unknown): ProbeResult {
  if (isLlmTimeoutError(err)) return "timeout";
  return "unreachable";
}
