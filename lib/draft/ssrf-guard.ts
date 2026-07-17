// lib/draft/ssrf-guard.ts
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const BLOCKED_RANGES: { start: string; bits: number }[] = [
  { start: "127.0.0.0", bits: 8 }, // loopback
  { start: "10.0.0.0", bits: 8 }, // private
  { start: "172.16.0.0", bits: 12 }, // private
  { start: "192.168.0.0", bits: 16 }, // private
  { start: "169.254.0.0", bits: 16 }, // link-local, includes 169.254.169.254 cloud metadata
];

function ipToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isBlockedIp(ip: string): boolean {
  if (isIP(ip) !== 4) return true; // reject non-IPv4 conservatively (out of scope, block by default)
  const target = ipToInt(ip);
  return BLOCKED_RANGES.some(({ start, bits }) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (target & mask) === (ipToInt(start) & mask);
  });
}

export async function resolveAndCheck(hostname: string): Promise<string> {
  const { address } = await lookup(hostname);
  if (isBlockedIp(address)) {
    throw new Error(`SSRF guard: blocked IP ${address} resolved for host ${hostname}`);
  }
  return address;
}
