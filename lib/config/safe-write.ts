/**
 * Wraps a config-file write in try/catch so a genuine I/O failure (disk
 * full, permissions, etc.) surfaces as `{ok: false, error}` instead of an
 * unhandled Server Action rejection.
 *
 * Mirrors `app/review/actions.ts`'s `safeUpdate` helper, adapted for the
 * config-file write path (`writeConfig`/`writeFile` via
 * `saveSettings`/`saveProviders`/`saveSources`) instead of the DB write path.
 * Every Config UI Server Action that persists a config file routes its
 * `saveX(...)` call through this helper so a failed write always leaves the
 * caller with a visible error rather than a thrown promise rejection — see
 * the "final whole-branch review" finding this file was added to close.
 */
export async function safeWrite(fn: () => Promise<void>): Promise<{ ok: boolean; error?: string }> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
