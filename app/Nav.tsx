/**
 * Site navigation — single-row top nav, active route underlined in
 * primary (see DESIGN.md §5, "Navigation"). Client Component: active-route
 * detection needs next/navigation's usePathname hook.
 *
 * Also owns the one global primary action, "Run Now" — previously buried
 * inside the Settings page, now reachable from every route since kicking
 * off a pipeline run isn't a settings-configuration concern. Reuses the
 * exact `runNow` Server Action Settings already had (see
 * config/settings/actions.ts); this is a relocation of the trigger, not a
 * new code path. Feedback is a floating toast (DESIGN.md's one sanctioned
 * shadow use) rather than an inline status line, since there's no fixed
 * "page" for that line to live in as the user navigates between routes
 * while a run is in flight.
 *
 * Nav links use next/link, not a plain `<a>` — critical now that Run Now
 * lives here: a plain `<a>` forces a full page reload on every nav click,
 * which remounts this whole component and resets `isRunning` to false even
 * while a run is still executing server-side. That's exactly the gap that
 * lets a second Run Now click slip past the disabled state mid-run. `Link`
 * keeps this component (and its in-flight `useTransition` state) mounted
 * across navigation instead.
 */
"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { runNow } from "./config/settings/actions";

const LINKS = [
  { href: "/review", label: "Review" },
  { href: "/config/api", label: "API Config" },
  { href: "/config/settings", label: "Settings" },
  { href: "/config/costs", label: "Costs" },
  { href: "/admin", label: "Admin" },
];

const TOAST_MS = 4000;

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isRunning, startRun] = useTransition();
  const [toast, setToast] = useState<{ message: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleRunNow = () => {
    startRun(async () => {
      const result = await runNow();
      if (!result.ok) {
        setToast({ message: result.error ?? "Run failed", isError: true });
        return;
      }
      setToast({ message: "Run completed.", isError: false });
      router.refresh();
    });
  };

  return (
    <>
      <nav className="site-nav">
        <div className="site-nav-links">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href || pathname.startsWith(`${link.href}/`) ? "active" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <button className="primary site-nav-run" onClick={handleRunNow} disabled={isRunning}>
          {isRunning ? "Running…" : "Run Now"}
        </button>
      </nav>
      {toast && (
        <div className={toast.isError ? "toast toast--danger" : "toast"} role="status">
          {toast.message}
        </div>
      )}
    </>
  );
}
