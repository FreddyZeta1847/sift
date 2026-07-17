import { describe, it, expect, afterEach } from "vitest";
import { checkAndSetRunning, clearRunning } from "./run-guard";

describe("run-guard", () => {
  afterEach(() => {
    clearRunning();
  });

  it("acquires the lock on first call", () => {
    expect(checkAndSetRunning()).toBe(true);
  });

  it("refuses a second acquisition while already running", () => {
    expect(checkAndSetRunning()).toBe(true);
    expect(checkAndSetRunning()).toBe(false);
  });

  it("allows acquisition again after clearRunning", () => {
    expect(checkAndSetRunning()).toBe(true);
    clearRunning();
    expect(checkAndSetRunning()).toBe(true);
  });
});
