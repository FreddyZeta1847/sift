import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { readConfig } from "./read-config";

const testDir = "config-test";

describe("readConfig", () => {
  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("creates the file with defaults if it doesn't exist", async () => {
    mkdirSync(testDir, { recursive: true });
    const defaults = { foo: "bar" };

    const result = await readConfig(`${testDir}/missing.json`, defaults);

    expect(result).toEqual(defaults);
    expect(existsSync(`${testDir}/missing.json`)).toBe(true);
  });

  it("returns the parsed content if the file exists", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/existing.json`, JSON.stringify({ foo: "baz" }));

    const result = await readConfig(`${testDir}/existing.json`, { foo: "bar" });

    expect(result).toEqual({ foo: "baz" });
  });

  it("throws a clear error on malformed JSON, naming the file", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/corrupt.json`, "{ not valid json");

    await expect(readConfig(`${testDir}/corrupt.json`, {})).rejects.toThrow(
      /corrupt\.json/
    );
  });
});
