// lib/draft/enrich.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { enrichWithArticleContent } from "./enrich";
import type { CuratedItem } from "../curation/run";

vi.mock("./safe-fetch");

describe("enrichWithArticleContent", () => {
  afterEach(() => vi.restoreAllMocks());

  it("extracts readable article text on success", async () => {
    const safeFetch = await import("./safe-fetch");
    vi.spyOn(safeFetch, "safeFetchHtml").mockResolvedValue(
      "<html><body><article><h1>Title</h1><p>This is the real article body with enough content to be extracted by readability parsing logic reliably across many different sentence structures and paragraph layouts.</p></article></body></html>"
    );
    const item: CuratedItem = { id: 1, url: "https://example.test/article", sourceRecap: "recap", whyPicked: "why" };

    const result = await enrichWithArticleContent(item);

    expect(result.articleText).toContain("real article body");
  });

  it("falls back to sourceRecap on any fetch failure, never throws", async () => {
    const safeFetch = await import("./safe-fetch");
    vi.spyOn(safeFetch, "safeFetchHtml").mockRejectedValue(new Error("SSRF guard: blocked"));
    const item: CuratedItem = { id: 2, url: "https://example.test/blocked", sourceRecap: "fallback recap", whyPicked: "why" };

    const result = await enrichWithArticleContent(item);

    expect(result.articleText).toBe("fallback recap");
  });

  it("falls back to sourceRecap when extraction finds no usable content", async () => {
    const safeFetch = await import("./safe-fetch");
    vi.spyOn(safeFetch, "safeFetchHtml").mockResolvedValue("<html><body></body></html>");
    const item: CuratedItem = { id: 3, url: "https://example.test/empty", sourceRecap: "fallback recap", whyPicked: "why" };

    const result = await enrichWithArticleContent(item);

    expect(result.articleText).toBe("fallback recap");
  });
});
