import { describe, it, expect, afterEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import { getSources } from "./sources";
import { SEED_SOURCES } from "./seed-sources";

describe("getSources", () => {
  afterEach(() => {
    if (existsSync("config")) rmSync("config", { recursive: true, force: true });
  });

  it("seeds the starter source list by default", async () => {
    const result = await getSources();
    expect(result).toEqual(SEED_SOURCES);
  });
});
