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
import { getModels } from "../../../lib/config/models";
import { getSettings } from "../../../lib/config/settings";
import { ApiConfigForm } from "./ApiConfigForm";

// Renders live, mutable server state (providers/settings) — never valid to
// prerender as a static snapshot at build time.
export const dynamic = "force-dynamic";

export default async function ApiConfigPage() {
  const [providers, settings, models] = await Promise.all([getProviders(), getSettings(), getModels()]);
  return (
    <main>
      {/* The page head sits outside ApiConfigForm's `.config-page` root so
          the form owns only its panels. `.config-page` is what
          `main:has(.config-page)` keys the wider measure off, and it stays
          where it is — these are dense forms, not reading prose. */}
      <div className="page-head">
        <div className="page-head-text">
          <h1>API Config</h1>
          <p className="page-head-sub">
            Where the models come from, which one each stage uses, and what they cost.
          </p>
        </div>
      </div>
      <ApiConfigForm providers={providers} settings={settings} models={models} />
    </main>
  );
}
