#!/usr/bin/env node
/**
 * Global CLI entry point for sift. Install once with either
 * `npm link` or `npm install -g .` (run from the repo root), then
 * `sift-server` starts the dev server from any working directory —
 * it locates its own file on disk to find the repo root and runs
 * `npm run dev` there, so config/ and data/ resolve exactly as they
 * do when running `npm run dev` directly inside the repo.
 *
 * Usage: sift-server [-- <next dev args>]
 * Uninstall: npm uninstall -g sift
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const extraArgs = process.argv.slice(2);

// shell: true is required on Windows, where npm itself is the "npm.cmd"
// shim (a batch file) — child_process.spawn can't exec a .cmd directly
// without going through a shell.
const child = spawn(
  "npm",
  ["run", "dev", ...(extraArgs.length ? ["--", ...extraArgs] : [])],
  { cwd: repoRoot, stdio: "inherit", shell: true }
);

child.on("exit", (code) => process.exit(code ?? 0));
