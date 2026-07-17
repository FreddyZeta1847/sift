import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import nock from "nock";
import type { Source } from "../config/types";
import { fetchSource } from "./fetch";

describe("fetchSource", () => {
  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    nock.cleanAll();
  });

  afterAll(() => {
    nock.enableNetConnect();
  });

  it("parses an RSS feed source with the real rss-parser pipeline", async () => {
    const source: Source = { name: "Test RSS", url: "https://example.test/feed.xml", category: "ai-ml", enabled: true };
    const rssXml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>Test Feed</title>
      <item>
        <title><![CDATA[Item One <special>]]></title>
        <link>https://example.test/one</link>
        <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
        <description>Summary one</description>
      </item>
      <item>
        <title>Item Two</title>
        <link>https://example.test/two</link>
        <pubDate>Tue, 02 Jan 2026 00:00:00 GMT</pubDate>
        <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[<p>Full content two</p>]]></content:encoded>
        <description>Summary two</description>
      </item>
    </channel></rss>`;
    nock("https://example.test").get("/feed.xml").reply(200, rssXml, { "Content-Type": "application/rss+xml" });

    const items = await fetchSource(source);

    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Item One <special>");
    expect(items[0].link).toBe("https://example.test/one");
    expect(items[0].summary).toBe("Summary one");
    expect(items[1].title).toBe("Item Two");
    expect(items[1].link).toBe("https://example.test/two");
  });
});
