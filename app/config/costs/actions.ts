/**
 * Server Actions for the Costs page (`/config/costs`).
 *
 * `saveBudgetCap` is the only mutation this page needs — it reads the full
 * settings object, patches `budgetCapUsd`, and writes it back, following the
 * same read-modify-write pattern as the other single-field settings actions
 * in `app/config/settings/actions.ts`. `null` means "unlimited".
 */
"use server";

import { getSettings, saveSettings } from "../../../lib/config/settings";

interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function saveBudgetCap(budgetCapUsd: number | null): Promise<ActionResult> {
  const settings = await getSettings();
  await saveSettings({ ...settings, budgetCapUsd });
  return { ok: true };
}
