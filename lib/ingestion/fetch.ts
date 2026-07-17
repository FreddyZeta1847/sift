import Parser from "rss-parser";
import * as cheerio from "cheerio";
import type { Source } from "../config/types";
import { SIFT_USER_AGENT } from "./rate-limit";

export interface RawFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  summary?: string;
}

let rssParser: Parser | null = null;

function getRssParser(): Parser {
  if (!rssParser) {
    rssParser = new Parser({ headers: { "User-Agent": SIFT_USER_AGENT } });
  }
  return rssParser;
}

async function fetchTldrPage(source: Source): Promise<RawFeedItem[]> {
  const res = await fetch(source.url, { headers: { "User-Agent": SIFT_USER_AGENT } });
  const html = await res.text();
  const $ = cheerio.load(html);
  const items: RawFeedItem[] = [];
  $("article").each((_, el) => {
    const link = $(el).find("h3 a").first();
    const title = link.text().trim();
    const href = link.attr("href");
    const summary = $(el).find("p").first().text().trim();
    if (title && href) items.push({ title, link: href, summary });
  });
  return items;
}

export async function fetchSource(source: Source & { isTldr?: boolean }): Promise<RawFeedItem[]> {
  if (source.isTldr) {
    return fetchTldrPage(source);
  }
  const parser = getRssParser();
  const feed = await parser.parseURL(source.url);
  return (feed.items ?? []).map((item) => ({
    title: item.title ?? "",
    link: item.link ?? "",
    pubDate: item.pubDate,
    summary: item.contentSnippet ?? item.content ?? "",
  }));
}
