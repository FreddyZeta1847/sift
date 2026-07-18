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

export default async function SettingsPage() {
  const sources = await getSources();
  const settings = await getSettings();
  return (
    <main>
      <h1>Settings</h1>
      <SettingsForm sources={sources} settings={settings} />
    </main>
  );
}
