/**
 * Next.js build configuration for sift. Sets standalone output (for the
 * Docker runner image, see Dockerfile), pins file-tracing to this
 * project's own root, and lists native/runtime-loaded dependencies that
 * must bypass Next's own bundler via `serverExternalPackages`.
 */
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
  // @huggingface/transformers ships native ONNX bindings and its own
  // dynamic model-loading machinery — it isn't designed to survive being
  // bundled/transformed by Next's own build pipeline, so it's treated as an
  // external CommonJS/ESM dependency and loaded as-is at runtime instead.
  // See vault-sift/features/TRANSLATION/TRANSLATION--technologies.md.
  serverExternalPackages: ["@huggingface/transformers"],
};

export default nextConfig;
