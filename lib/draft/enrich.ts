/**
 * lib/draft/enrich.ts
 *
 * Fetches and extracts real article text for a curated item so the
 * drafting LLM writes from actual source content, not just its short
 * curation-stage recap. Falls back to sourceRecap whenever the fetch
 * fails, Readability finds nothing, or the extracted text itself looks
 * like a bot-verification/challenge page rather than a real article —
 * safe-fetch.ts already rejects non-2xx responses, but some anti-bot
 * systems return 200 with an HTML challenge page, so this is a second,
 * content-based line of defense against feeding that page's own text to
 * the LLM as if it were the source material.
 */
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { safeFetchHtml } from "./safe-fetch";
import type { CuratedItem } from "../curation/run";

export interface EnrichedItem extends CuratedItem {
  articleText: string;
}

// Not exhaustive — anti-bot challenge pages vary a lot — but this catches
// the common phrasing (Vercel/Cloudflare-style checkpoints, generic "prove
// you're human" interstitials) cheaply, as a substring match against the
// extracted text rather than trying to parse every vendor's page structure.
const BOT_CHALLENGE_PHRASES = [
  "checking your browser",
  "security checkpoint",
  "verify you are human",
  "verify you're human",
  "enable javascript and cookies",
  "attention required",
  "please complete the security check",
  "captcha",
];

function looksLikeBotChallenge(text: string): boolean {
  const lower = text.toLowerCase();
  return BOT_CHALLENGE_PHRASES.some((phrase) => lower.includes(phrase));
}

export async function enrichWithArticleContent(item: CuratedItem): Promise<EnrichedItem> {
  try {
    const html = await safeFetchHtml(item.url);
    const dom = new JSDOM(html, { url: item.url });
    const article = new Readability(dom.window.document).parse();
    const text = article?.textContent?.trim() ?? "";
    if (text.length > 0 && !looksLikeBotChallenge(text)) {
      return { ...item, articleText: text };
    }
    return { ...item, articleText: item.sourceRecap };
  } catch {
    return { ...item, articleText: item.sourceRecap };
  }
}
