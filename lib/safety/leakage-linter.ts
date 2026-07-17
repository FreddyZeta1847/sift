// lib/safety/leakage-linter.ts
/**
 * Lightweight, non-blocking regex check for obvious prompt-injection-leakage
 * tells in a drafted post's text — the last line of defense after
 * DRAFT-GENERATOR's delimiter-based mitigation, before a human reviews the
 * post. No LLM call, never blocks a run. See
 * vault-sift/features/DISTRIBUTION-TRUST/DISTRIBUTION-TRUST--security.md.
 */
const LEAKAGE_PATTERNS = [
  /ignore (all )?previous instructions/i,
  /as an ai language model/i,
  /system prompt/i,
  /i (cannot|can't) (comply|assist) with/i,
];

export function isFlagged(text: string): boolean {
  return LEAKAGE_PATTERNS.some((pattern) => pattern.test(text));
}
