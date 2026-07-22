/**
 * Root layout — loads the "Organic" design system's fonts (Bricolage
 * Grotesque for display/headings, Instrument Sans for body/UI, IBM Plex
 * Mono for data) as CSS variables consumed by globals.css, fetches the
 * sidebar's data (an in-progress run to resume polling, the last
 * finished run, and the undecided-post count for its badge/footer stat),
 * and renders the persistent sidebar alongside every page's content
 * inside the .app-shell flex layout.
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
