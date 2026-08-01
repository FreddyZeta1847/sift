/**
 * lib/draft/safe-fetch.ts
 *
 * SSRF-hardened HTML fetcher used by the drafting pipeline's article
 * enrichment step (see enrich.ts). Validates and pins the connection to
 * the already-resolved IP (closing the DNS-rebinding TOCTOU window),
 * follows redirects manually up to a cap, streams the body under a size
 * cap, and rejects non-text/html and non-2xx responses outright — the
 * latter so a bot-block/rate-limit page (403/429/503) can never be
 * mistaken downstream for real article content.
 */
import { Agent } from "undici";
import { resolveAndCheck } from "./ssrf-guard";
import { SIFT_USER_AGENT } from "../ingestion/rate-limit";

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

// Pins the connection to the IP already validated by resolveAndCheck, closing the
// TOCTOU window between DNS-rebinding-vulnerable validation and fetch's own resolution.
// The original hostname is still used for the request/TLS SNI — only the socket target changes.
function pinnedDispatcher(resolvedIp: string): Agent {
  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options.all) {
          callback(null, [{ address: resolvedIp, family: 4 }]);
        } else {
          callback(null, resolvedIp, 4);
        }
      },
    },
  });
}

async function readBoundedBody(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("Response exceeded size cap");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

export async function safeFetchHtml(url: string): Promise<string> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(currentUrl);
    const resolvedIp = await resolveAndCheck(parsed.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "User-Agent": SIFT_USER_AGENT },
        dispatcher: pinnedDispatcher(resolvedIp),
      } as RequestInit);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      currentUrl = new URL(res.headers.get("location")!, currentUrl).toString();
      continue;
    }

    // A non-2xx response (commonly a 403/429/503 from a bot-block/rate-limit
    // page) must not be treated as real content — letting it through here
    // used to mean Readability would happily "extract" a challenge page's
    // own text and hand it to the drafting LLM as if it were the article.
    if (!res.ok) {
      throw new Error(`Fetch failed with status ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    return await readBoundedBody(res);
  }

  throw new Error("Too many redirects");
}
