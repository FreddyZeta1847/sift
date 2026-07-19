import { describe, it, expect, vi, afterEach } from "vitest";
import * as nodeCron from "node-cron";
import { registerCronJob } from "./cron";

describe("registerCronJob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    registerCronJob([], "09:00", async () => {}); // reset to no active job between tests
  });

  it("registers a cron task when scheduleDays is non-empty", () => {
    const scheduleSpy = vi.spyOn(nodeCron, "schedule");
    registerCronJob(["mon", "wed", "fri"], "09:00", async () => {});
    expect(scheduleSpy).toHaveBeenCalledWith("0 9 * * 1,3,5", expect.any(Function), expect.objectContaining({ timezone: "UTC" }));
  });

  it("stops any previous task before registering a new one", () => {
    const stopSpy = vi.fn();
    vi.spyOn(nodeCron, "schedule").mockReturnValue({ stop: stopSpy } as unknown as ReturnType<typeof nodeCron.schedule>);
    registerCronJob(["mon"], "09:00", async () => {});
    registerCronJob(["tue"], "10:00", async () => {});
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("does not register a task when scheduleDays is empty, and stops any existing one", () => {
    const stopSpy = vi.fn();
    vi.spyOn(nodeCron, "schedule").mockReturnValue({ stop: stopSpy } as unknown as ReturnType<typeof nodeCron.schedule>);
    registerCronJob(["mon"], "09:00", async () => {});
    const scheduleSpy = vi.spyOn(nodeCron, "schedule");
    registerCronJob([], "09:00", async () => {});
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("throws instead of registering when the constructed expression is invalid, leaving any previous task running", () => {
    const stopSpy = vi.fn();
    vi.spyOn(nodeCron, "schedule").mockReturnValue({ stop: stopSpy } as unknown as ReturnType<typeof nodeCron.schedule>);
    registerCronJob(["mon"], "09:00", async () => {});

    expect(() => registerCronJob(["mon"], "not-a-time", async () => {})).toThrow();
    expect(stopSpy).not.toHaveBeenCalled(); // previous task was never stopped, since the new one never validated
  });
});
