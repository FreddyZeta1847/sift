// lib/draft/safe-fetch.test.ts
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { safeFetchHtml } from "./safe-fetch";

vi.mock("./ssrf-guard", () => ({ resolveAndCheck: vi.fn().mockResolvedValue("93.184.216.34") }));

const { agentCalls } = vi.hoisted(() => ({ agentCalls: [] as unknown[] }));

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  class SpiedAgent extends actual.Agent {
    constructor(opts?: ConstructorParameters<typeof actual.Agent>[0]) {
      agentCalls.push(opts);
      super(opts);
    }
  }
  return { ...actual, Agent: SpiedAgent };
});

describe("safeFetchHtml", () => {
  beforeEach(async () => {
    agentCalls.length = 0;
    // vi.restoreAllMocks() in afterEach resets vi.fn() mocks (not created via spyOn) to a
    // no-op, so the resolved value from the "./ssrf-guard" module mock must be re-armed here.
    const ssrfModule = await import("./ssrf-guard");
    vi.mocked(ssrfModule.resolveAndCheck).mockResolvedValue("93.184.216.34");
  });
  afterEach(() => vi.restoreAllMocks());

  it("fetches and returns HTML body text/html responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>hi</body></html>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
    const html = await safeFetchHtml("https://example.test/article");
    expect(html).toContain("<body>hi</body>");
  });

  it("follows a redirect and re-validates the new host via SSRF guard", async () => {
    const ssrfModule = await import("./ssrf-guard");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { Location: "https://redirected.test/final" } }))
      .mockResolvedValueOnce(new Response("<html>final</html>", { status: 200, headers: { "Content-Type": "text/html" } }));

    await safeFetchHtml("https://example.test/start");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(ssrfModule.resolveAndCheck).toHaveBeenCalledWith("redirected.test");
  });

  it("rejects a non-text/html content-type", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("binary", { status: 200, headers: { "Content-Type": "application/pdf" } }));
    await expect(safeFetchHtml("https://example.test/file.pdf")).rejects.toThrow(/content-type/i);
  });

  it("throws after exceeding the redirect cap", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://example.test/loop" } }));
    await expect(safeFetchHtml("https://example.test/loop")).rejects.toThrow(/redirect/i);
  });

  it("pins the fetch connection to the SSRF-validated IP via a dispatcher with a custom lookup", async () => {
    const undici = await import("undici");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>hi</body></html>", { status: 200, headers: { "Content-Type": "text/html" } })
    );

    await safeFetchHtml("https://example.test/article");

    // A pinned Agent (dispatcher) is built and passed to fetch on every request.
    expect(agentCalls).toHaveLength(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchOptions = fetchSpy.mock.calls[0][1] as { dispatcher?: unknown };
    expect(fetchOptions.dispatcher).toBeInstanceOf(undici.Agent);

    // Drive the lookup passed to Agent() directly: it must resolve to the IP already
    // validated by resolveAndCheck (mocked to "93.184.216.34"), not perform a fresh DNS lookup.
    const agentOptions = agentCalls[0] as {
      connect: {
        lookup: (
          hostname: string,
          options: { all?: boolean },
          callback: (err: null, address: string | { address: string; family: number }[], family?: number) => void
        ) => void;
      };
    };

    const results: unknown[] = [];
    agentOptions.connect.lookup("example.test", { all: true }, (_err, address) => results.push(address));
    expect(results[0]).toEqual([{ address: "93.184.216.34", family: 4 }]);

    agentOptions.connect.lookup("example.test", { all: false }, (_err, address, family) => results.push([address, family]));
    expect(results[1]).toEqual(["93.184.216.34", 4]);
  });

  it("streams the response body and rejects once it exceeds the size cap, without buffering it fully", async () => {
    const chunk = new Uint8Array(1024 * 1024); // 1MB per chunk; cap is 2MB
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls > 5) {
          // Would need 5+ chunks (5MB) to reach here; the cap must trip well before this.
          controller.close();
          return;
        }
        controller.enqueue(chunk);
      },
    });

    const res = new Response(stream, { status: 200, headers: { "Content-Type": "text/html" } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(res);

    await expect(safeFetchHtml("https://example.test/huge")).rejects.toThrow(/size cap/i);
    // The cap is exceeded after the 3rd 1MB chunk; we must not have pulled all 6 (i.e. never fully buffered).
    expect(pulls).toBeLessThan(6);
  });
});
