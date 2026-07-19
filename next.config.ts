import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin Next.js's workspace-root inference to this project's own directory
  // (Phase 4 turns sift into a long-running server process via
  // `instrumentation.ts`'s in-process cron, so a deterministic standalone
  // build output path matters more here than in prior phases) rather than
  // letting it walk up to whichever ancestor directory happens to have a
  // lockfile.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
