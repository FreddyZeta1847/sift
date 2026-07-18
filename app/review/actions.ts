/**
 * Server Actions for the Review Workspace (`/review`).
 *
 * Handles the DB-writing half of the review-card interactions defined in
 * DraftCard.tsx: saving an edited draft, discarding a post, and marking a
 * post as posted. Deliberately excludes the clipboard write for
 * "Copy & Mark Posted" — `navigator.clipboard.writeText` is a browser-only
 * API and cannot run inside a Server Action, so DraftCard performs the
 * clipboard write client-side first and only calls `markPosted` here once
 * that write has succeeded (see DraftCard.tsx for the clipboard-gating).
 *
 * `discarded` and `posted` are mutually exclusive terminal states for a
 * post — a discarded post was never sent, so it cannot also be posted, and
 * vice versa. `discardPost` and `markPosted` each read the current row and
 * refuse to write if the row is already in the *other* terminal state. This
 * is the authoritative guard: the DraftCard UI also disables both buttons
 * once either state is set, but that's only a same-page-load convenience
 * (see DraftCard.tsx's `muted` derivation) — this server-side check is what
 * actually prevents the invalid `discarded: true, posted: true` combination
 * from ever being written, regardless of what the client's stale props show.
 *
 * Per REVIEW-WORKSPACE--resilience.md, a write that fails because SQLite
 * can't be acquired (e.g. a transient lock) must not be silently dropped:
 * `safeUpdate` retries once after a brief delay before surfacing an error.
 *
 * `regeneratePost`/`keepVersion` (Task 6) live in lib/draft/regenerate.ts so
 * the batch pipeline and the per-post Regenerate UI share one implementation
 * (see that file's header). They are wrapped here as local async function
 * declarations rather than re-exported directly (`export { x } from "..."`)
 * because Next's "use server" compiler statically requires every top-level
 * export of a "use server" file to be an async function declaration — a
 * bare re-export trips "Only async functions are allowed to be exported in
 * a 'use server' file" at dev/build time even though the re-exported values
 * are themselves async functions.
 */
"use server";

import { eq } from "drizzle-orm";
import { getDb } from "../../lib/db/client";
import { postsTable } from "../../lib/db/schema";
import { regeneratePost as regeneratePostImpl, keepVersion as keepVersionImpl } from "../../lib/draft/regenerate";

interface ActionResult {
  ok: boolean;
  error?: string;
}

const RETRY_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeUpdate(postId: number, values: Partial<typeof postsTable.$inferInsert>): Promise<ActionResult> {
  try {
    const db = getDb();
    await db.update(postsTable).set(values).where(eq(postsTable.id, postId));
    return { ok: true };
  } catch (err) {
    // Transient failures (e.g. SQLite momentarily locked by another writer) must not
    // silently drop the change — retry once before giving up and surfacing an error.
    await delay(RETRY_DELAY_MS);
    try {
      const db = getDb();
      await db.update(postsTable).set(values).where(eq(postsTable.id, postId));
      return { ok: true };
    } catch (retryErr) {
      return { ok: false, error: (retryErr as Error).message };
    }
  }
}

export async function saveEdit(postId: number, text: string): Promise<ActionResult> {
  return safeUpdate(postId, { editedText: text });
}

export async function discardPost(postId: number): Promise<ActionResult> {
  const db = getDb();
  const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (row?.posted) {
    return { ok: false, error: "Cannot discard a post that's already marked posted" };
  }
  return safeUpdate(postId, { discarded: true });
}

export async function markPosted(postId: number): Promise<ActionResult> {
  const db = getDb();
  const [row] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (row?.discarded) {
    return { ok: false, error: "Cannot mark a discarded post as posted" };
  }
  return safeUpdate(postId, { posted: true, postedAt: new Date() });
}

export async function regeneratePost(postId: number): Promise<ActionResult> {
  return regeneratePostImpl(postId);
}

export async function keepVersion(keptPostId: number, deletedPostId: number): Promise<ActionResult> {
  return keepVersionImpl(keptPostId, deletedPostId);
}
