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
  // TLDR is intentionally dropped from v1 (not deferred): its URLs require date-based
  // construction (e.g. tldr.tech/ai/2026-07-17) rather than static feeds, and the fetch
  // path built for it during Phase 2 was never fully wired up. Revisit with a fresh
  // design pass if TLDR support is wanted post-v1.
];
