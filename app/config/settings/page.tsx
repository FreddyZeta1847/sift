/**
 * Settings route (`/config/settings`).
 *
 * Server Component: reads the current source list and settings (Task 7's
 * `getSources`/`getSettings`) and hands them to `SettingsForm`, the Client
 * Component that owns sources, schedule, Run Now, voice profile, and
 * retention interactions (see SettingsForm.tsx). This page is UI wiring
 * only — the mutation logic itself is exercised at the action layer
 * (actions.test.ts).
 */
import { getSources } from "../../../lib/config/sources";
import { getSettings } from "../../../lib/config/settings";
import { SettingsForm } from "./SettingsForm";

// Renders live, mutable server state (sources/settings) — never valid to
// prerender as a static snapshot at build time.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sources = await getSources();
  const settings = await getSettings();
  return (
    <main>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Settings</h1>
          <p className="page-head-sub">What the pipeline reads, when it runs, and how it writes.</p>
        </div>
      </div>
      <SettingsForm sources={sources} settings={settings} />
    </main>
  );
}
