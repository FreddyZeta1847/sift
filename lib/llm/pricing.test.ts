import { describe, it, expect } from "vitest";
import { costOf } from "./pricing";

describe("costOf", () => {
  it("computes cost for a known model", () => {
    // gpt-4o-mini: $0.15 / 1M input tokens
    const cost = costOf("gpt-4o-mini", 1_000_000, "input");
    expect(cost).toBeCloseTo(0.15, 5);
  });

  it("defaults unknown/free/local models to $0", () => {
    expect(costOf("llama3-local-ollama", 1_000_000, "input")).toBe(0);
    expect(costOf("llama3-local-ollama", 1_000_000, "output")).toBe(0);
  });
});
