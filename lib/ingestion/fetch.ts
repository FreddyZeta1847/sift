import Parser from "rss-parser";
import type { Source } from "../config/types";
import { SIFT_USER_AGENT } from "./rate-limit";

export interface RawFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  summary?: string;
}

const rssParser = new Parser({ headers: { "User-Agent": SIFT_USER_AGENT } });

export async function fetchSource(source: Source): Promise<RawFeedItem[]> {
  const feed = await rssParser.parseURL(source.url);
  return (feed.items ?? []).map((item) => ({
    title: item.title ?? "",
    link: item.link ?? "",
    pubDate: item.pubDate,
    summary: item.contentSnippet ?? item.content ?? "",
  }));
}
