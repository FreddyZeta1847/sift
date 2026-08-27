/**
 * Tests for the pure pricing helpers.
 *
 * The interesting one is the pair at the bottom: a model registered at a
 * price of zero and a model nobody has priced both cost $0, but they mean
 * opposite things, and isPriced is what keeps them distinguishable. Losing
 * that distinction is how real spend became invisible in the first place.
 */
import { describe, it, expect } from "vitest";
import { costOf, findModelEntry, isPriced } from "./pricing";
import type { ModelEntry } from "../config/models";

const MODELS: ModelEntry[] = [
  { providerId: "openai", model: "gpt-4o-mini", inputPer1M: 0.15, outputPer1M: 0.6 },
  // Same model name, different provider, different price — the reason the
  // registry is keyed by the pair rather than by model alone.
  { providerId: "openrouter", model: "gpt-4o-mini", inputPer1M: 0.2, outputPer1M: 0.8 },
  { providerId: "ollama", model: "llama3.1:8b", inputPer1M: 0, outputPer1M: 0 },
];

describe("findModelEntry", () => {
  it("matches on provider and model together", () => {
    expect(findModelEntry(MODELS, "openai", "gpt-4o-mini")?.inputPer1M).toBe(0.15);
    expect(findModelEntry(MODELS, "openrouter", "gpt-4o-mini")?.inputPer1M).toBe(0.2);
  });

  it("does not match a model borrowed from another provider", () => {
    expect(findModelEntry(MODELS, "anthropic", "gpt-4o-mini")).toBeUndefined();
  });
});

describe("costOf", () => {
  it("computes cost from the registry row", () => {
    expect(costOf(findModelEntry(MODELS, "openai", "gpt-4o-mini"), 1_000_000, "input")).toBeCloseTo(0.15, 5);
    expect(costOf(findModelEntry(MODELS, "openai", "gpt-4o-mini"), 1_000_000, "output")).toBeCloseTo(0.6, 5);
  });

  it("charges nothing for a local model registered as free", () => {
    expect(costOf(findModelEntry(MODELS, "ollama", "llama3.1:8b"), 1_000_000, "input")).toBe(0);
  });

  it("falls back to $0 for a model nobody has priced", () => {
    expect(costOf(undefined, 1_000_000, "input")).toBe(0);
    expect(costOf(undefined, 1_000_000, "output")).toBe(0);
  });
});

describe("isPriced", () => {
  it("separates 'free' from 'unknown', which both compute to zero", () => {
    const free = findModelEntry(MODELS, "ollama", "llama3.1:8b");
    const unknown = findModelEntry(MODELS, "google-gemini", "gemini-3-flash-preview");

    expect(costOf(free, 1_000_000, "input")).toBe(0);
    expect(costOf(unknown, 1_000_000, "input")).toBe(0);

    // Same number, opposite meanings. Only this tells them apart.
    expect(isPriced(free)).toBe(true);
    expect(isPriced(unknown)).toBe(false);
  });
});
