/**
 * API Config route (`/config/api`).
 *
 * Server Component: reads the current provider list and stage assignments
 * (Task 7's `getProviders`/`getSettings`) and hands them to `ApiConfigForm`,
 * the Client Component that owns all provider CRUD, model-assignment, and
 * "test this model" interactions (see ApiConfigForm.tsx). This page is UI
 * wiring only — the CRUD/probe logic itself is exercised at the action
 * layer (actions.test.ts) and the probe layer (test-model-probe.test.ts).
 */
import { getProviders } from "../../../lib/config/providers";
import { getSettings } from "../../../lib/config/settings";
import { ApiConfigForm } from "./ApiConfigForm";

export default async function ApiConfigPage() {
  const providers = await getProviders();
  const settings = await getSettings();
  return (
    <main>
      <h1>API Config</h1>
      <ApiConfigForm providers={providers} settings={settings} />
    </main>
  );
}
