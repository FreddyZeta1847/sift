// lib/draft/safe-fetch.ts
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

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Unexpected content-type: ${contentType}`);
    }

    return await readBoundedBody(res);
  }

  throw new Error("Too many redirects");
}
