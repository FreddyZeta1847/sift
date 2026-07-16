import type { Source } from "./types";

export const SEED_SOURCES: Source[] = [
  { name: "arXiv cs.AI", url: "http://export.arxiv.org/rss/cs.AI", category: "ai-ml", enabled: true },
  { name: "arXiv cs.LG", url: "http://export.arxiv.org/rss/cs.LG", category: "ai-ml", enabled: true },
  { name: "arXiv cs.RO", url: "http://export.arxiv.org/rss/cs.RO", category: "robotics", enabled: true },
  { name: "Hacker News", url: "https://hnrss.org/frontpage", category: "general-tech", enabled: true },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews", category: "cybersecurity", enabled: true },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/", category: "cybersecurity", enabled: true },
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/", category: "cybersecurity", enabled: true },
  { name: "IEEE Spectrum Robotics", url: "https://spectrum.ieee.org/feeds/topic/robotics.rss", category: "robotics", enabled: true },
  // TLDR is intentionally deferred to Phase 2 — its URLs require date-based construction
  // (e.g., tldr.tech/ai/2026-07-17) rather than static feeds, which belongs in INGESTION's
  // Phase 2 implementation when fetch logic can handle dynamic URL patterns.
];
