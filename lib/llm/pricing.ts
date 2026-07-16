interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
}

// Prices in USD per 1M tokens. Unknown models (including all free/local
// models, e.g. anything run via Ollama) default to $0 — this is what makes
// budget enforcement a natural no-op for them rather than a special case.
const PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { inputPer1M: 0.15, outputPer1M: 0.6 },
  "gpt-4o": { inputPer1M: 2.5, outputPer1M: 10.0 },
  "claude-3-5-haiku-20241022": { inputPer1M: 0.8, outputPer1M: 4.0 },
  "claude-3-5-sonnet-20241022": { inputPer1M: 3.0, outputPer1M: 15.0 },
};

export function costOf(model: string, tokens: number, kind: "input" | "output"): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  const rate = kind === "input" ? pricing.inputPer1M : pricing.outputPer1M;
  return (tokens / 1_000_000) * rate;
}
