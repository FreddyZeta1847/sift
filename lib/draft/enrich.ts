// lib/draft/enrich.ts
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { safeFetchHtml } from "./safe-fetch";
import type { CuratedItem } from "../curation/run";

export interface EnrichedItem extends CuratedItem {
  articleText: string;
}

export async function enrichWithArticleContent(item: CuratedItem): Promise<EnrichedItem> {
  try {
    const html = await safeFetchHtml(item.url);
    const dom = new JSDOM(html, { url: item.url });
    const article = new Readability(dom.window.document).parse();
    if (article?.textContent && article.textContent.trim().length > 0) {
      return { ...item, articleText: article.textContent.trim() };
    }
    return { ...item, articleText: item.sourceRecap };
  } catch {
    return { ...item, articleText: item.sourceRecap };
  }
}
