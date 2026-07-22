/**
 * "Test this model" probe used by the API Config page (`/config/api`).
 *
 * Sends a minimal structured-output request through the same `callLLM`
 * path the pipeline itself uses (lib/llm/provider.ts), so the probe result
 * reflects exactly what Curation Engine/Draft Generator would experience
 * with this provider+model pair. Distinguishes four outcomes so the UI can
 * give an actionable signal:
 *   - "pass": the model returned parseable JSON — good to assign.
 *   - "fail": the call succeeded but the model didn't follow the structured
 *     -output instruction (see the capability-floor note in provider.ts) —
 *     the model itself is the problem.
 *   - "unreachable": the call threw (network error, bad credentials, bad
 *     baseUrl, non-2xx from the provider) — the provider/config is the
 *     problem.
 *   - "timeout": no response within `timeoutMs` — treated distinctly from
 *     "unreachable" since a hung endpoint is a different failure shape than
 *     an outright rejection.
 *
 * DEFAULT_TIMEOUT_MS was originally 10s on the assumption that a trivial
 * one-line prompt is always fast. Measured against a real reasoning model
 * (Gemini's gemini-3-flash-preview), a trivial prompt still took 24s —
 * these models spend tokens on hidden reasoning before ever emitting
 * visible content, so latency isn't just a function of prompt/output size.
 * 10s was reporting "timeout" for a model that was actually working fine,
 * just slower than assumed. 30s gives real reasoning models room to
 * respond while still being far shorter than the main pipeline's 180s
 * LLM_TIMEOUT_MS (this probe is a quick interactive UI check, not a full
 * pipeline call).
 *
 * PROBE_MAX_OUTPUT_TOKENS was originally 20 — enough for a non-reasoning
 * model to echo `{"ok": true}`, but a real observed case with a reasoning
 * model (Gemini's gemini-flash-latest) spent the entire 20-token budget on
 * hidden reasoning and returned a response with no `content` field at all
 * (`finish_reason: "length"`, `completion_tokens: 0`) — a real, working
 * model and key, reported as "unreachable" purely because the budget was
 * too small for this model class to say anything visible at all. 200
 * gives real reasoning models room to finish their hidden reasoning and
 * still emit the tiny visible answer this probe actually checks for.
 */
import { callLLM } from "../llm/provider";
import type { Provider } from "./types";

export type ProbeResult = "pass" | "fail" | "unreachable" | "timeout";

const DEFAULT_TIMEOUT_MS = 30_000;
const PROBE_MAX_OUTPUT_TOKENS = 200;

export async function probeModel(provider: Provider, model: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProbeResult> {
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));

  const call = (async (): Promise<"pass" | "fail" | "unreachable"> => {
    try {
      const result = await callLLM(
        provider,
        model,
        [{ role: "user", content: 'Respond with ONLY this exact JSON: {"ok": true}' }],
        { maxOutputTokens: PROBE_MAX_OUTPUT_TOKENS }
      );
      // A model that responds but produces no usable text (missing/empty
      // content — e.g. a reasoning model that ran out of budget before any
      // visible output) is the same class of problem as invalid JSON: the
      // model itself is the issue, not connectivity/credentials. Only an
      // actual thrown error (network, auth, bad baseUrl, non-2xx) should
      // ever reach the catch block below as "unreachable".
      if (!result.content || typeof result.content !== "string" || result.content.trim().length === 0) {
        return "fail";
      }
      JSON.parse(result.content.trim());
      return "pass";
    } catch (err) {
      if (err instanceof SyntaxError) return "fail";
      return "unreachable";
    }
  })();

  return Promise.race([call, timeout]);
}
