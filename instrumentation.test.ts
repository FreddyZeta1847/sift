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
import * as modelHealthModule from "./lib/health/model-health";

describe("register", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_RUNTIME;
  });

  it("runs migrations, aborts orphaned runs, initializes the scheduler, then starts the model health check", async () => {
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
    const healthSpy = vi
      .spyOn(modelHealthModule, "startModelHealthCheck")
      .mockImplementation(() => {
        callOrder.push("start-health");
      });

    await register();

    expect(migrateSpy).toHaveBeenCalled();
    expect(abortSpy).toHaveBeenCalled();
    expect(initSpy).toHaveBeenCalled();
    expect(healthSpy).toHaveBeenCalled();
    // Health check last: it is the only step that merely has to have STARTED
    // before the first request, not finished.
    expect(callOrder).toEqual(["migrate", "abort-orphaned", "init", "start-health"]);
  });

  it("resolves even when the model health check never finishes", async () => {
    // The regression lock for ~/.claude/issues/013: Next.js serves no request
    // until register() resolves, so a provider that hangs forever must not be
    // able to keep the whole app offline.
    process.env.NEXT_RUNTIME = "nodejs";
    vi.spyOn(migrateModule, "runMigrations").mockImplementation(() => {});
    vi.spyOn(runPipelineModule, "abortOrphanedRuns").mockResolvedValue({ aborted: 0 });
    vi.spyOn(schedulerInitModule, "initializeScheduler").mockResolvedValue(undefined);
    vi.spyOn(modelHealthModule, "startModelHealthCheck").mockImplementation(() => {
      // Exactly what the real one does: kicks off work that never settles and
      // hands nothing back that could be awaited.
      void new Promise(() => {});
    });

    await expect(register()).resolves.toBeUndefined();
  });

  it("does nothing outside the nodejs runtime (e.g. edge)", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const migrateSpy = vi.spyOn(migrateModule, "runMigrations").mockImplementation(() => {});
    const abortSpy = vi.spyOn(runPipelineModule, "abortOrphanedRuns");
    const initSpy = vi
      .spyOn(schedulerInitModule, "initializeScheduler")
      .mockImplementation(async () => {});
    const healthSpy = vi.spyOn(modelHealthModule, "startModelHealthCheck").mockImplementation(() => {});

    await register();

    expect(migrateSpy).not.toHaveBeenCalled();
    expect(abortSpy).not.toHaveBeenCalled();
    expect(initSpy).not.toHaveBeenCalled();
    expect(healthSpy).not.toHaveBeenCalled();
  });
});
