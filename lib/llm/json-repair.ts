/**
 * Best-effort repair for a common LLM JSON-formatting mistake: writing a
 * literal newline/carriage-return/tab character inside a JSON string value
 * instead of escaping it (\n/\r/\t) — invalid per the JSON spec, but a
 * frequent failure mode for models without strict JSON-mode enforcement,
 * especially when asked for multi-line formatted text (e.g. a bullet-point
 * LinkedIn post) inside a single string field. Used by Curation Engine and
 * Draft Generator before JSON.parse on a raw LLM response.
 */

// Walks the raw text char by char, tracking whether the cursor is inside a
// JSON string (toggling on an unescaped double-quote) and escapes a raw
// control character only while inside one — structural whitespace between
// JSON tokens (outside any string) is left untouched.
export function repairJsonControlChars(raw: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const ch of raw) {
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }

    if (ch === "\n") {
      result += "\\n";
    } else if (ch === "\r") {
      result += "\\r";
    } else if (ch === "\t") {
      result += "\\t";
    } else {
      result += ch;
    }
  }

  return result;
}
