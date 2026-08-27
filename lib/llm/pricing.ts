/**
 * Turns token counts into dollars, using the user's own model registry
 * (config/models.json — see lib/config/models.ts).
 *
 * Deliberately pure and synchronous: the caller loads the registry once and
 * passes the matching row in. Cost is arithmetic, and arithmetic should not
 * do I/O.
 *
 * THE $0 DISTINCTION THAT MATTERS
 * Two different things used to both come out as $0.00, indistinguishably:
 *
 *   - a model that IS free (Ollama, anything local) — registered with a
 *     price of 0, and genuinely costing nothing;
 *   - a model nobody has priced yet — a real, billed model whose spend was
 *     being reported as zero and, worse, was invisible to the monthly
 *     budget cap, which could therefore never fire.
 *
 * Both still compute to 0, because an unpriced model's real cost is unknown
 * and guessing would be worse. The difference is that isPriced() now lets
 * every surface that shows a cost say which of the two it is looking at.
 */
import type { ModelEntry } from "../config/models";

export function findModelEntry(models: ModelEntry[], providerId: string, model: string): ModelEntry | undefined {
  return models.find((m) => m.providerId === providerId && m.model === model);
}

/**
 * True when this provider+model pair has a row in the registry — including a
 * row that says it is free. False means "we do not know what this costs",
 * which is a thing worth telling the user, not a synonym for free.
 */
export function isPriced(entry: ModelEntry | undefined): entry is ModelEntry {
  return entry !== undefined;
}

export function costOf(entry: ModelEntry | undefined, tokens: number, kind: "input" | "output"): number {
  if (!entry) return 0;
  const rate = kind === "input" ? entry.inputPer1M : entry.outputPer1M;
  return (tokens / 1_000_000) * rate;
}
