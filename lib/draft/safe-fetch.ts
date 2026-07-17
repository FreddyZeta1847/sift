// lib/draft/safe-fetch.ts
import { resolveAndCheck } from "./ssrf-guard";
import { SIFT_USER_AGENT } from "../ingestion/rate-limit";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export async function safeFetchHtml(url: string): Promise<string> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(currentUrl);
    await resolveAndCheck(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": SIFT_USER_AGENT },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      currentUrl = new URL(res.headers.get("location")!, currentUrl).toString();
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    const body = await res.text();
    if (Buffer.byteLength(body, "utf-8") > MAX_BYTES) {
      throw new Error("Response exceeded size cap");
    }
    return body;
  }

  throw new Error("Too many redirects");
}
