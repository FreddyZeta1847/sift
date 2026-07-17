import { describe, it, expect } from "vitest";
import { normalize } from "./normalize";
import type { Source } from "../config/types";
import type { RawFeedItem } from "./fetch";

describe("normalize", () => {
  it("maps a raw feed item into the common schema", () => {
    const source: Source = { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cybersecurity", enabled: true };
    const raw: RawFeedItem = { title: "A Headline", link: "https://krebsonsecurity.com/2026/01/a-headline/", pubDate: "Mon, 01 Jan 2026 00:00:00 GMT", summary: "A brief summary." };

    const result = normalize(raw, source);

    expect(result.title).toBe("A Headline");
    expect(result.url).toBe("https://krebsonsecurity.com/2026/01/a-headline/");
    expect(result.source).toBe("Krebs on Security");
    expect(result.category).toBe("cybersecurity");
    expect(result.summary).toBe("A brief summary.");
    expect(result.id).toMatch(/^[a-f0-9]{64}$/); // sha256 hex digest of the url
    expect(new Date(result.fetchedAt).toString()).not.toBe("Invalid Date");
  });

  it("produces the same id for the same url every time", () => {
    const source: Source = { name: "S", url: "https://s.test/feed", category: "ai-ml", enabled: true };
    const raw: RawFeedItem = { title: "T", link: "https://s.test/article", summary: "" };
    expect(normalize(raw, source).id).toBe(normalize(raw, source).id);
  });
});
