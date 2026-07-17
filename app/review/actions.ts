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
 */
"use server";

import { eq } from "drizzle-orm";
import { getDb } from "../../lib/db/client";
import { postsTable } from "../../lib/db/schema";

interface ActionResult {
  ok: boolean;
  error?: string;
}

async function safeUpdate(postId: number, values: Partial<typeof postsTable.$inferInsert>): Promise<ActionResult> {
  try {
    const db = getDb();
    await db.update(postsTable).set(values).where(eq(postsTable.id, postId));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function saveEdit(postId: number, text: string): Promise<ActionResult> {
  return safeUpdate(postId, { editedText: text });
}

export async function discardPost(postId: number): Promise<ActionResult> {
  return safeUpdate(postId, { discarded: true });
}

export async function markPosted(postId: number): Promise<ActionResult> {
  return safeUpdate(postId, { posted: true, postedAt: new Date() });
}
