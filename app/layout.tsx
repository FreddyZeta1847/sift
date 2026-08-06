/**
 * Root layout — loads the "Organic" design system's fonts (Bricolage
 * Grotesque for display/headings, Instrument Sans for body/UI, IBM Plex
 * Mono for data) as CSS variables consumed by globals.css, fetches the
 * sidebar's data (an in-progress run to resume polling, the last
 * finished run, and the undecided-post count for its badge/footer stat),
 * and renders the persistent sidebar alongside every page's content
 * inside the .app-shell flex layout.
 *
 * `export const dynamic = "force-dynamic"` (found necessary 2026-08-06,
 * verifying a fresh `docker compose build`): without it, `next build`
 * tries to statically prerender "/" at build time, which runs this
 * layout's DB queries before any database exists in a truly fresh
 * environment (no `data/sift.db` yet — migrations only run at container
 * startup, not image build time) and fails with `SqliteError: no such
 * table: pipeline_runs`. This had been silently masked in every local
 * dev/test build because a migrated `data/sift.db` already existed from
 * prior work — it only surfaces on a genuinely fresh clone+build, which
 * is exactly what `docker compose up -d` does for a new self-hoster.
 * Every real page here needs live DB data anyway (no actual static
 * content exists in this app), so forcing the whole tree dynamic has no
 * downside.
 */
import type { Metadata } from "next";
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "./Nav";
import { getInProgressRun, getMostRecentFinishedRun, getUndecidedPostCount } from "../lib/review/queries";

const bricolageGrotesque = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "sift",
  description: "RSS in, LinkedIn drafts out.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [inProgress, lastRun, undecidedCount] = await Promise.all([
    getInProgressRun(),
    getMostRecentFinishedRun(),
    getUndecidedPostCount(),
  ]);

  return (
    <html
      lang="en"
      className={`${bricolageGrotesque.variable} ${instrumentSans.variable} ${plexMono.variable}`}
    >
      <body>
        <div className="app-shell">
          <Nav
            initialInProgress={inProgress}
            lastRunFinishedAt={lastRun?.finishedAt ?? null}
            undecidedCount={undecidedCount}
          />
          {children}
        </div>
      </body>
    </html>
  );
}
