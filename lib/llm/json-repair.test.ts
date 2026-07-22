/**
 * Tests for repairJsonControlChars() — see lib/llm/json-repair.ts's header
 * for the real bug this targets (a raw newline inside a JSON string value).
 */
import { describe, it, expect } from "vitest";
import { repairJsonControlChars } from "./json-repair";

describe("repairJsonControlChars", () => {
  it("escapes a raw newline inside a string value", () => {
    const raw = '{"text": "line one\nline two"}';
    const repaired = repairJsonControlChars(raw);
    expect(() => JSON.parse(repaired)).not.toThrow();
    expect(JSON.parse(repaired)).toEqual({ text: "line one\nline two" });
  });

  it("escapes raw carriage returns and tabs inside a string value", () => {
    const raw = '{"text": "a\r\tb"}';
    const repaired = repairJsonControlChars(raw);
    expect(JSON.parse(repaired)).toEqual({ text: "a\r\tb" });
  });

  it("reproduces the real observed failure: a multi-line bullet-cascade post", () => {
    const raw =
      '[{"id": "749", "title": "GPT-5.6 Series", "text": "OpenAI launched a preview.\n' +
      '- Sol is 2x cheaper.\n' +
      '- Luna brings strong capability.", "imagePrompt": "a launch event"}]';

    expect(() => JSON.parse(raw)).toThrow(); // confirms the raw input really is invalid JSON
    const repaired = repairJsonControlChars(raw);
    const parsed = JSON.parse(repaired);
    expect(parsed[0].text).toContain("- Sol is 2x cheaper.");
    expect(parsed[0].text).toContain("- Luna brings strong capability.");
  });

  it("leaves whitespace between JSON tokens (outside any string) untouched", () => {
    const raw = '{\n  "a": 1,\n  "b": 2\n}';
    expect(() => JSON.parse(raw)).not.toThrow(); // already valid — pretty-printed JSON
    const repaired = repairJsonControlChars(raw);
    expect(JSON.parse(repaired)).toEqual({ a: 1, b: 2 });
  });

  it("does not break on an already-escaped newline sequence (backslash-n)", () => {
    const raw = '{"text": "line one\\nline two"}';
    const repaired = repairJsonControlChars(raw);
    expect(JSON.parse(repaired)).toEqual({ text: "line one\nline two" });
  });

  it("correctly tracks string boundaries across an escaped quote", () => {
    const raw = '{"text": "she said \\"hi\\"\nthen left"}';
    const repaired = repairJsonControlChars(raw);
    expect(JSON.parse(repaired)).toEqual({ text: 'she said "hi"\nthen left' });
  });

  it("correctly tracks string boundaries across an escaped backslash followed by a real closing quote", () => {
    const raw = '{"path": "C:\\\\temp"}';
    const repaired = repairJsonControlChars(raw);
    expect(JSON.parse(repaired)).toEqual({ path: "C:\\temp" });
  });
});
