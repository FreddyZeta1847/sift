// lib/draft/ssrf-guard.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { isBlockedIp, resolveAndCheck } from "./ssrf-guard";

describe("isBlockedIp", () => {
  it("blocks loopback", () => expect(isBlockedIp("127.0.0.1")).toBe(true));
  it("blocks 10.x private range", () => expect(isBlockedIp("10.1.2.3")).toBe(true));
  it("blocks 172.16-31.x private range", () => expect(isBlockedIp("172.20.0.1")).toBe(true));
  it("blocks 192.168.x private range", () => expect(isBlockedIp("192.168.1.1")).toBe(true));
  it("blocks link-local incl. cloud metadata 169.254.169.254", () => expect(isBlockedIp("169.254.169.254")).toBe(true));
  it("allows a public IP", () => expect(isBlockedIp("8.8.8.8")).toBe(false));
  it("blocks non-IPv4 addresses conservatively", () => expect(isBlockedIp("::1")).toBe(true));
});

describe("resolveAndCheck", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws when the resolved address is blocked", async () => {
    vi.doMock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue({ address: "127.0.0.1" }) }));
    vi.resetModules();
    const { resolveAndCheck: mockedCheck } = await import("./ssrf-guard");
    await expect(mockedCheck("internal.test")).rejects.toThrow(/SSRF guard/);
  });

  it("returns the address when it's not blocked", async () => {
    vi.doMock("node:dns/promises", () => ({ lookup: vi.fn().mockResolvedValue({ address: "93.184.216.34" }) }));
    vi.resetModules();
    const { resolveAndCheck: mockedCheck } = await import("./ssrf-guard");
    await expect(mockedCheck("example.test")).resolves.toBe("93.184.216.34");
  });
});
