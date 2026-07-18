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
 */
import { callLLM } from "../llm/provider";
import type { Provider } from "./types";

export type ProbeResult = "pass" | "fail" | "unreachable" | "timeout";

const DEFAULT_TIMEOUT_MS = 10_000;

export async function probeModel(provider: Provider, model: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<ProbeResult> {
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), timeoutMs));

  const call = (async (): Promise<"pass" | "fail" | "unreachable"> => {
    try {
      const result = await callLLM(
        provider,
        model,
        [{ role: "user", content: 'Respond with ONLY this exact JSON: {"ok": true}' }],
        { maxOutputTokens: 20 }
      );
      JSON.parse(result.content.trim());
      return "pass";
    } catch (err) {
      if (err instanceof SyntaxError) return "fail";
      return "unreachable";
    }
  })();

  return Promise.race([call, timeout]);
}
