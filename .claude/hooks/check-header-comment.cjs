/**
 * PostToolUse hook (Write|Edit) enforcing the "every code file starts with a
 * multi-line header comment" convention from ~/.claude/CLAUDE.md's Coding
 * Style section. Runs after every Write/Edit, regardless of which skill or
 * subagent produced the change, so the convention can't be silently skipped
 * by a narrowly-scoped implementer subagent.
 *
 * Reads the PostToolUse JSON payload from stdin, checks whether the written
 * file (if its extension marks it as source/script, not docs/config/data)
 * opens with a language-appropriate multi-line comment. A missing header
 * only produces an advisory note injected back into the model's context via
 * hookSpecificOutput.additionalContext — it never blocks or fails the tool
 * call.
 *
 * Allowed before the header comment: a shebang line, a leading
 * "use client"/"use server" directive (common in this project's Next.js
 * files), and blank lines around either.
 */

const fs = require("node:fs");

const C_STYLE_EXTS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".java", ".c", ".cc", ".cpp", ".h", ".hpp", ".hh",
  ".cs", ".go", ".rs", ".kt", ".kts", ".swift", ".php", ".scala",
]);
const PYTHON_STYLE_EXTS = new Set([".py"]);
const RUBY_STYLE_EXTS = new Set([".rb"]);

function commentCheckerFor(ext) {
  if (C_STYLE_EXTS.has(ext)) return (text) => /^\/\*/.test(text);
  if (PYTHON_STYLE_EXTS.has(ext)) return (text) => /^("""|''')/.test(text);
  if (RUBY_STYLE_EXTS.has(ext)) return (text) => /^=begin/.test(text);
  return null;
}

function extOf(filePath) {
  const match = /\.[^./\\]+$/.exec(filePath || "");
  return match ? match[0].toLowerCase() : "";
}

function stripAllowedPrefixes(content) {
  let text = content.replace(/^﻿/, "");
  text = text.replace(/^#!.*(\r?\n)/, "");
  text = text.replace(/^(\s*\r?\n)+/, "");
  text = text.replace(/^["'](?:use client|use server)["'];?\s*(\r?\n)/, "");
  text = text.replace(/^(\s*\r?\n)+/, "");
  return text.replace(/^[ \t]+/, "");
}

function main(input) {
  let payload;
  try {
    payload = JSON.parse(input);
  } catch {
    return; // malformed input — fail open, no output
  }

  const filePath = payload?.tool_input?.file_path ?? payload?.tool_response?.filePath;
  if (!filePath) return;

  const checker = commentCheckerFor(extOf(filePath));
  if (!checker) return; // not a source/script extension we track — docs/config/data, skip

  let raw;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return; // file unreadable/gone — fail open
  }

  if (checker(stripAllowedPrefixes(raw))) return; // header present — silent pass

  const message =
    `${filePath} doesn't open with the multi-line header comment required by ` +
    `~/.claude/CLAUDE.md's "File header comments" convention. Add one describing ` +
    `the file's content and role before finishing this task.`;

  process.stdout.write(
    JSON.stringify({
      systemMessage: `Header comment missing: ${filePath}`,
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: message,
      },
    })
  );
}

let stdin = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (stdin += chunk));
process.stdin.on("end", () => {
  try {
    main(stdin);
  } catch {
    // fail open — never block the tool call over a hook bug
  }
  process.exit(0);
});
