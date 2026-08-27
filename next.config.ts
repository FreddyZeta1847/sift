/**
 * Next.js build configuration for sift. Sets standalone output (for the
 * Docker runner image, see Dockerfile), pins file-tracing to this
 * project's own root, and lists native/runtime-loaded dependencies that
 * must bypass Next's own bundler via `serverExternalPackages`.
 *
 * SIFT_DIST_DIR exists to stop a verification build from breaking a running
 * dev server. `next build` and `next dev` share `.next/` but write
 * incompatible artifacts into it, so building while a dev server is live
 * leaves that server serving 500s against a directory it no longer
 * recognises — with an error that gives no hint of the real cause (this has
 * now happened twice here; see ~/.claude/issues/007). Setting the variable
 * sends a build somewhere else entirely:
 *
 *   SIFT_DIST_DIR=.next-verify npx next build
 *
 * Use it for any build whose only purpose is to check that things compile.
 * Real builds (Docker, deploy) leave it unset and use `.next` as normal.
 */
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.SIFT_DIST_DIR || ".next",
  // Pin Next.js's workspace-root inference to this project's own directory
  // (Phase 4 turns sift into a long-running server process via
  // `instrumentation.ts`'s in-process cron, so a deterministic standalone
  // build output path matters more here than in prior phases) rather than
  // letting it walk up to whichever ancestor directory happens to have a
  // lockfile.
  outputFileTracingRoot: __dirname,
  // @huggingface/transformers ships native ONNX bindings and its own
  // dynamic model-loading machinery — it isn't designed to survive being
  // bundled/transformed by Next's own build pipeline, so it's treated as an
  // external CommonJS/ESM dependency and loaded as-is at runtime instead.
  // See vault-sift/features/TRANSLATION/TRANSLATION--technologies.md.
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
