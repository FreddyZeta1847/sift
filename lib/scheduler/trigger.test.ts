import { describe, it, expect, vi, afterEach } from "vitest";
import { triggerRun } from "./trigger";
import * as runPipelineModule from "../../scripts/run-pipeline";
import * as runGuardModule from "../pipeline/run-guard";

describe("triggerRun", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    runGuardModule.clearRunning();
  });

  it("calls runPipeline with the given type when not already running", async () => {
    const pipelineSpy = vi.spyOn(runPipelineModule, "runPipeline").mockResolvedValue({ status: "success" });

    await triggerRun("scheduled");

    expect(pipelineSpy).toHaveBeenCalledWith("scheduled");
  });

  it("is a silent no-op if a run is already in progress", async () => {
    runGuardModule.checkAndSetRunning();
    const pipelineSpy = vi.spyOn(runPipelineModule, "runPipeline");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await triggerRun("catchup");

    expect(pipelineSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("no-op"));
  });

  it("clears the run guard even if runPipeline throws", async () => {
    vi.spyOn(runPipelineModule, "runPipeline").mockRejectedValue(new Error("unexpected"));

    await expect(triggerRun("scheduled")).rejects.toThrow("unexpected");
    expect(runGuardModule.checkAndSetRunning()).toBe(true); // guard was released
  });
});
