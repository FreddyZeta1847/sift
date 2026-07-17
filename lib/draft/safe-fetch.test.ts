// lib/draft/safe-fetch.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { safeFetchHtml } from "./safe-fetch";

vi.mock("./ssrf-guard", () => ({ resolveAndCheck: vi.fn().mockResolvedValue("93.184.216.34") }));

describe("safeFetchHtml", () => {
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
});
