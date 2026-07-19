import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { readConfig, writeConfig } from "./read-config";

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

  it("fills in a default for a key missing from an existing file (added after that file was written)", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/existing.json`, JSON.stringify({ foo: "baz" }));

    const result = await readConfig(`${testDir}/existing.json`, { foo: "bar", newField: 3 });

    expect(result).toEqual({ foo: "baz", newField: 3 });
  });

  it("does not merge array-shaped config (providers.json/sources.json) — returns the array as-is", async () => {
    mkdirSync(testDir, { recursive: true });
    const stored = [{ id: "p1" }, { id: "p2" }];
    writeFileSync(`${testDir}/list.json`, JSON.stringify(stored));

    const result = await readConfig(`${testDir}/list.json`, []);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual(stored);
  });

  it("throws a clear error on malformed JSON, naming the file", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/corrupt.json`, "{ not valid json");

    await expect(readConfig(`${testDir}/corrupt.json`, {})).rejects.toThrow(
      /corrupt\.json/
    );
  });
});

describe("writeConfig", () => {
  afterEach(() => {
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("writeConfig overwrites the file with the given data", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(`${testDir}/existing.json`, JSON.stringify({ foo: "old" }));

    await writeConfig(`${testDir}/existing.json`, { foo: "new" });

    const raw = readFileSync(`${testDir}/existing.json`, "utf-8");
    expect(JSON.parse(raw)).toEqual({ foo: "new" });
  });
});
