// instrumentation.test.ts
/**
 * Confirms register() runs migrations before initializing the scheduler,
 * and only inside the nodejs runtime — this is what makes a fresh clone
 * (or a fresh Docker volume) boot successfully with zero manual setup.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { register } from "./instrumentation";
import * as migrateModule from "./lib/db/migrate";
import * as schedulerInitModule from "./lib/scheduler/init";

describe("register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_RUNTIME;
  });

  it("runs migrations before initializing the scheduler when NEXT_RUNTIME is nodejs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const callOrder: string[] = [];
    const migrateSpy = vi
      .spyOn(migrateModule, "runMigrations")
      .mockImplementation(() => {
        callOrder.push("migrate");
      });
    const initSpy = vi
      .spyOn(schedulerInitModule, "initializeScheduler")
      .mockImplementation(async () => {
        callOrder.push("init");
      });

    await register();

    expect(migrateSpy).toHaveBeenCalled();
    expect(initSpy).toHaveBeenCalled();
    expect(callOrder).toEqual(["migrate", "init"]);
  });

  it("does nothing outside the nodejs runtime (e.g. edge)", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const migrateSpy = vi.spyOn(migrateModule, "runMigrations").mockImplementation(() => {});
    const initSpy = vi
      .spyOn(schedulerInitModule, "initializeScheduler")
      .mockImplementation(async () => {});

    await register();

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled();
  });
});
