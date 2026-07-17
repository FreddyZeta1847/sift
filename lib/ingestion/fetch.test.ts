import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { Source } from "../config/types";

// Mock rss-parser to use mocked fetch
vi.mock("rss-parser", () => {
  return {
    default: class MockParser {
      constructor(_options: any) {}
      async parseURL(url: string) {
        const response = await fetch(url);
        const text = await response.text();
        // Very simple RSS parser for testing
        const titleMatch = text.match(/<title>([^<]+)<\/title>/);
        const linkMatch = text.match(/<link>([^<]+)<\/link>/);
        const pubDateMatch = text.match(/<pubDate>([^<]+)<\/pubDate>/);
        const descMatch = text.match(/<description>([^<]+)<\/description>/);

        if (titleMatch && linkMatch) {
          return {
            items: [
              {
                title: titleMatch[1],
                link: linkMatch[1],
                pubDate: pubDateMatch ? pubDateMatch[1] : undefined,
                contentSnippet: descMatch ? descMatch[1] : undefined,
              },
            ],
          };
        }
        return { items: [] };
      }
    },
  };
});

import { fetchSource } from "./fetch";

describe("fetchSource", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses an RSS feed source", async () => {
    const source: Source = { name: "Test RSS", url: "https://example.test/feed.xml", category: "ai-ml", enabled: true };
    const rssXml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>Item One</title><link>https://example.test/one</link><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate><description>Summary one</description></item>
    </channel></rss>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(rssXml, { status: 200, headers: { "Content-Type": "application/rss+xml" } }));

    const items = await fetchSource(source);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Item One");
    expect(items[0].link).toBe("https://example.test/one");
  });

  it("parses a TLDR archive page source via HTML", async () => {
    const source: Source = { name: "TLDR", url: "https://tldr.tech/ai", category: "ai-ml", enabled: true, isTldr: true } as Source;
    const html = `<html><body>
      <article><h3><a href="https://tldr.tech/ai/2026-01-01/one">Headline One</a></h3><p>Blurb one.</p></article>
    </body></html>`;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(html, { status: 200, headers: { "Content-Type": "text/html" } }));

    const items = await fetchSource(source);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Headline One");
    expect(items[0].link).toBe("https://tldr.tech/ai/2026-01-01/one");
  });
});
