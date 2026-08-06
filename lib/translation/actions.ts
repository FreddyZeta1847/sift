/**
 * Core translation Server Action logic — the DB-writing counterpart to
 * translate.ts's pure inference call. Lives in lib/ (not app/review/actions.ts
 * directly) matching this codebase's established split: app/review/actions.ts
 * is a thin "use server" wrapper (a bare `export { x } from "..."` trips
 * Next's "use server" compiler, which requires every top-level export of
 * such a file to be an async function declaration — see that file's
 * header), while the actual logic lives here so it can be unit-tested
 * without Next's Server Action machinery.
 *
 * `translatePost()` loads a post's current English text (`editedText ??
 * originalText`, the same precedence DraftCard.tsx already uses to render
 * the "live" version of a post) and upserts a post_translations row for
 * `(postId, language)`. There is no unique index on `(post_id, language)`
 * at the DB level (see drizzle/0006_youthful_wallow.sql), so there is
 * nothing for a Drizzle `onConflictDoUpdate` to target — the upsert is a
 * plain select-then-insert-or-update instead, matching the rest of this
 * codebase's "explicit application-level logic over ORM magic" style (see
 * lib/admin/delete.ts). On a translate() failure (TranslationError or
 * TranslationUnavailableError), no row is written at all: translate()
 * itself never touches the database (see its own header), and this
 * function does not paper over that by writing a placeholder/error row —
 * it just returns `{ ok: false, error }`. This is what
 * TRANSLATION--resilience.md's "no post_translations row on a failed
 * attempt" actually means in practice.
 *
 * `saveTranslationEdit()` is the translation-tab equivalent of `saveEdit()`
 * in app/review/actions.ts: the same autosave-on-blur write, with the same
 * retry-once-on-transient-failure behavior (`safeUpdateTranslation()` below
 * mirrors that file's `safeUpdate()` almost line for line). It deliberately
 * never touches `outdated` — that flag means "the English source moved out
 * from under this translation" (flipped by `markTranslationsOutdated()`,
 * called from `saveEdit()` in app/review/actions.ts when posts.editedText
 * changes), not "a human touched the translation text". Hand-fixing a
 * translation does not make it stale.
 *
 * `markTranslationsOutdated()` is the one-call-site staleness flip: only
 * app/review/actions.ts's `saveEdit()` mutates a post's live English text
 * in place, so it is the only caller that needs to flip every
 * post_translations row for that post to `outdated: true`. See
 * PHASE-6-TRANSLATION's review-ui-integration step for why the
 * regenerate-pick-winner action (`keepVersion()` in lib/draft/regenerate.ts)
 * does NOT also call this — it never edits a surviving row's text in
 * place, so there is nothing for it to flip.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { postsTable, postTranslationsTable } from "../db/schema";
import { translate, TranslationError, TranslationUnavailableError } from "./translate";
import type { Language } from "./models";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const RETRY_DELAY_MS = 100;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function translatePost(postId: number, language: Language): Promise<ActionResult> {
  const db = getDb();
  const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId));
  if (!post) {
    return { ok: false, error: `Post ${postId} not found` };
  }

  const sourceText = post.editedText ?? post.originalText;

  let translatedText: string;
  try {
    translatedText = await translate(sourceText, language);
  } catch (err) {
    if (err instanceof TranslationError || err instanceof TranslationUnavailableError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: (err as Error).message };
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: postTranslationsTable.id })
    .from(postTranslationsTable)
    .where(and(eq(postTranslationsTable.postId, postId), eq(postTranslationsTable.language, language)));

  if (existing) {
    await db
      .update(postTranslationsTable)
      .set({ translatedText, outdated: false, updatedAt: now })
      .where(eq(postTranslationsTable.id, existing.id));
  } else {
    await db.insert(postTranslationsTable).values({
      postId,
      language,
      translatedText,
      outdated: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ok: true };
}

async function safeUpdateTranslation(
  postId: number,
  language: Language,
  values: Partial<typeof postTranslationsTable.$inferInsert>
): Promise<ActionResult> {
  try {
    const db = getDb();
    await db
      .update(postTranslationsTable)
      .set(values)
      .where(and(eq(postTranslationsTable.postId, postId), eq(postTranslationsTable.language, language)));
    return { ok: true };
  } catch (err) {
    // Transient failures (e.g. SQLite momentarily locked by another writer) must not
    // silently drop the change — retry once before giving up and surfacing an error.
    await delay(RETRY_DELAY_MS);
    try {
      const db = getDb();
      await db
        .update(postTranslationsTable)
        .set(values)
        .where(and(eq(postTranslationsTable.postId, postId), eq(postTranslationsTable.language, language)));
      return { ok: true };
    } catch (retryErr) {
      return { ok: false, error: (retryErr as Error).message };
    }
  }
}

export async function saveTranslationEdit(postId: number, language: Language, text: string): Promise<ActionResult> {
  return safeUpdateTranslation(postId, language, { translatedText: text, updatedAt: new Date() });
}

export async function markTranslationsOutdated(postId: number): Promise<void> {
  const db = getDb();
  await db.update(postTranslationsTable).set({ outdated: true }).where(eq(postTranslationsTable.postId, postId));
}
