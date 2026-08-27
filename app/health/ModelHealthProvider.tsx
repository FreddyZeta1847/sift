/**
 * Owns everything about the model check that the browser needs to know:
 * the current state, the polling that follows it, the startup gate, the
 * result banner, and whether the two expensive buttons are locked.
 *
 * WHY A CONTEXT AND NOT PROPS
 * The Run Now button lives in Nav (rendered by the layout) and the two "Test
 * this model" buttons live inside the route segment. They are sibling trees,
 * so props can't reach both from one place. The alternative — each side
 * reading the server action for itself — means two independent polls and two
 * independently stale answers, which shows up as Nav unlocking while the Test
 * buttons stay grey. "Locked" has to be one fact.
 *
 * Living in the layout also means this component never unmounts on
 * navigation, so dismissing the gate survives moving between pages for free,
 * with no storage involved. sessionStorage covers only the harder case: a
 * full browser reload while a check is still running.
 *
 * TYPES ONLY FROM lib/health
 * Importing lib/health/model-health.ts here would pull probeModel -> callLLM
 * -> the Anthropic SDK into the browser bundle. The server is reached
 * exclusively through the getModelHealthStatus action.
 *
 * THE HARD CAP IS NOT A DETAIL
 * Buttons unlock after GATE_MAX_MS whatever the server says. A health check
 * exists to tell the user something is wrong; if it could wedge and leave the
 * app permanently half-disabled, it would be causing the class of problem it
 * was built to report.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getModelHealthStatus } from "./actions";
import { ModelCheckGate } from "./ModelCheckGate";
import { ModelHealthBanner } from "./ModelHealthBanner";
import type { HealthState } from "../../lib/health/types";

const POLL_MS = 1500;
const GATE_MAX_MS = 60_000;
const DISMISS_KEY = "sift.health.gateDismissed";

interface ModelHealthContextValue {
  health: HealthState;
  /** True while the first check of this process is still running. */
  actionsLocked: boolean;
}

const ModelHealthContext = createContext<ModelHealthContextValue>({
  health: { phase: "unknown" },
  actionsLocked: false,
});

export function useModelHealth(): ModelHealthContextValue {
  return useContext(ModelHealthContext);
}

export function ModelHealthProvider({
  initialHealth,
  children,
}: {
  initialHealth: HealthState;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [health, setHealth] = useState<HealthState>(initialHealth);
  const [dismissed, setDismissed] = useState(false);
  const [capReached, setCapReached] = useState(false);
  // A check that has already produced an answer once means this is no longer
  // a cold start, so a later re-check (after reassigning a model) updates the
  // banner without throwing the full-screen gate back up.
  const [coldStartDone, setColdStartDone] = useState(initialHealth.phase !== "checking");
  const [bannerHidden, setBannerHidden] = useState(false);

  // Compared by value, not identity: the layout is force-dynamic, so a new
  // object arrives on every navigation. Re-setting state on each of those
  // would stomp a fresher polled result with an identical server one.
  const serverKey = JSON.stringify(initialHealth);
  useEffect(() => {
    setHealth(JSON.parse(serverKey) as HealthState);
  }, [serverKey]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // Private mode, blocked storage — the gate simply doesn't remember.
    }
  }, []);

  const checking = health.phase === "checking";

  useEffect(() => {
    if (!checking) return;
    const interval = setInterval(async () => {
      setHealth(await getModelHealthStatus());
    }, POLL_MS);
    return () => clearInterval(interval);
  }, [checking]);

  useEffect(() => {
    if (!checking) {
      setCapReached(false);
      return;
    }
    const timer = setTimeout(() => setCapReached(true), GATE_MAX_MS);
    return () => clearTimeout(timer);
  }, [checking]);

  useEffect(() => {
    if (health.phase === "settled") setColdStartDone(true);
    if (health.phase === "checking") setBannerHidden(false);
  }, [health.phase]);

  const handleDismissGate = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Same as above — dismissal just won't survive a reload.
    }
  }, []);

  const stillWaiting = checking && !capReached;
  const isColdStart = !coldStartDone;

  // Deliberately NOT locked during a re-check: the user has already been
  // working, and yanking the buttons away right after they saved a model
  // assignment would interrupt them at the worst possible moment.
  const actionsLocked = stillWaiting && isColdStart;

  // Suppressed on API Config: if you are already on the page where models are
  // configured, covering it is the least useful thing a model check could do.
  const showGate = actionsLocked && !dismissed && pathname !== "/config/api";

  return (
    <ModelHealthContext.Provider value={{ health, actionsLocked }}>
      {showGate && <ModelCheckGate onDismiss={handleDismissGate} />}
      {health.phase === "settled" && !bannerHidden && (
        <ModelHealthBanner
          overall={health.overall}
          stages={health.stages}
          onDismiss={() => setBannerHidden(true)}
        />
      )}
      {children}
    </ModelHealthContext.Provider>
  );
}
