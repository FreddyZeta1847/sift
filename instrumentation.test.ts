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
import * as runPipelineModule from "./scripts/run-pipeline";

describe("register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_RUNTIME;
  });

  it("runs migrations, then aborts orphaned runs, then initializes the scheduler when NEXT_RUNTIME is nodejs", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const callOrder: string[] = [];
    const migrateSpy = vi
      .spyOn(migrateModule, "runMigrations")
      .mockImplementation(() => {
        callOrder.push("migrate");
      });
    const abortSpy = vi
      .spyOn(runPipelineModule, "abortOrphanedRuns")
      .mockImplementation(async () => {
        callOrder.push("abort-orphaned");
        return { aborted: 0 };
      });
    const initSpy = vi
      .spyOn(schedulerInitModule, "initializeScheduler")
      .mockImplementation(async () => {
        callOrder.push("init");
      });

    await register();

    expect(migrateSpy).toHaveBeenCalled();
    expect(abortSpy).toHaveBeenCalled();
    expect(initSpy).toHaveBeenCalled();
    expect(callOrder).toEqual(["migrate", "abort-orphaned", "init"]);
  });

  it("does nothing outside the nodejs runtime (e.g. edge)", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const migrateSpy = vi.spyOn(migrateModule, "runMigrations").mockImplementation(() => {});
    const abortSpy = vi.spyOn(runPipelineModule, "abortOrphanedRuns");
    const initSpy = vi
      .spyOn(schedulerInitModule, "initializeScheduler")
      .mockImplementation(async () => {});

    await register();

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled();
  });
});
