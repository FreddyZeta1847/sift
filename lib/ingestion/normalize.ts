import { createHash } from "node:crypto";
import type { Source } from "../config/types";
import type { RawFeedItem } from "./fetch";

export interface NormalizedItem {
  id: string;
  title: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string;
  summary: string;
  fetchedAt: string;
}

export function normalize(raw: RawFeedItem, source: Source): NormalizedItem {
  return {
    id: createHash("sha256").update(raw.link).digest("hex"),
    title: raw.title,
    url: raw.link,
    source: source.name,
    category: source.category,
    publishedAt: raw.pubDate ?? new Date().toISOString(),
    summary: raw.summary ?? "",
    fetchedAt: new Date().toISOString(),
  };
}
