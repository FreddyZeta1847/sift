/**
 * Interactive review card for a single drafted post (`/review`).
 *
 * Client Component: edits autosave on textarea blur via the `saveEdit`
 * Server Action, "Discard" calls `discardPost`, and "Copy & Mark Posted"
 * copies the current draft text to the clipboard and only calls the
 * `markPosted` Server Action if that clipboard write succeeds.
 *
 * This ordering is deliberate — `navigator.clipboard.writeText` is a
 * browser-only API and cannot run inside a Server Action, so the clipboard
 * write must happen here, client-side, before markPosted is ever called.
 * If the write fails, we surface an error and do NOT mark the post as
 * posted, since doing so would mislead the user into thinking they'd
 * copied and posted text that never actually made it to their clipboard.
 *
 * `muted` (derived from `post.posted`/`post.discarded`) is only as fresh as
 * the Server Component props from the last page load — the authoritative
 * mutual-exclusion guard against an invalid discarded+posted combination
 * lives server-side in discardPost/markPosted (see actions.ts). To keep the
 * UI from looking stale after a successful discard or mark-posted (which
 * would otherwise leave both buttons enabled until a manual reload), both
 * handlers call `router.refresh()` on success so the page re-fetches fresh
 * post state and the card re-renders muted immediately.
 *
 * Regenerate (Task 6) reuses this same "mutate then router.refresh()"
 * pattern via `useTransition` so the button can show a "Regenerating…"
 * label while the Server Action is in flight. It is disabled while muted,
 * while a regenerate for this card is already pending, or while this card
 * already has a `pendingVersion` awaiting resolution — this card's own
 * pending compare must be resolved (via "Keep this one"/"Keep original",
 * which call `keepVersion`) before another regenerate can be triggered for
 * it. Other cards remain fully interactive in the meantime: the run-guard
 * lock in `regeneratePost` only prevents two regenerate/pipeline runs from
 * overlapping, it doesn't block edits/discard/copy on other cards.
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEdit, discardPost, markPosted, regeneratePost, keepVersion } from "./actions";
import { isFlagged } from "../../lib/safety/leakage-linter";
import type { PostWithPending } from "../../lib/review/queries";

export function DraftCard({ post }: { post: PostWithPending }) {
  const router = useRouter();
  const [text, setText] = useState(post.editedText ?? post.originalText);
  const [status, setStatus] = useState<string | null>(null);
  const [isRegenerating, startTransition] = useTransition();

  const handleBlur = async () => {
    const result = await saveEdit(post.id, text);
    if (!result.ok) setStatus(`Save failed: ${result.error}`);
  };

  const handleDiscard = async () => {
    const result = await discardPost(post.id);
    if (!result.ok) {
      setStatus(`Discard failed: ${result.error}`);
      return;
    }
    setStatus("Discarded.");
    router.refresh();
  };

  const handleCopyAndPost = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setStatus("Clipboard write failed — not marked as posted.");
      return;
    }
    const result = await markPosted(post.id);
    if (!result.ok) {
      setStatus(`Copied, but marking posted failed: ${result.error}`);
      return;
    }
    setStatus("Copied and marked posted.");
    router.refresh();
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(post.imagePrompt);
    } catch {
      setStatus("Copy prompt failed.");
    }
  };

  const handleRegenerate = () => {
    startTransition(async () => {
      const result = await regeneratePost(post.id);
      if (!result.ok) {
        setStatus(`Regenerate failed: ${result.error}`);
        return;
      }
      router.refresh();
    });
  };

  const handleKeep = (keptId: number, deletedId: number) => {
    startTransition(async () => {
      const result = await keepVersion(keptId, deletedId);
      if (!result.ok) {
        setStatus(`Could not resolve regenerate: ${result.error}`);
        return;
      }
      router.refresh();
    });
  };

  const muted = post.posted || post.discarded;

  return (
    <div className={muted ? "card muted" : "card"}>
      {status && <p role="alert">{status}</p>}
      {isFlagged(text) && <span className="badge">content-safety flag</span>}
      <textarea defaultValue={text} onChange={(e) => setText(e.target.value)} onBlur={handleBlur} />
      <p className="prompt">{post.imagePrompt}</p>
      <button onClick={handleCopyPrompt}>Copy prompt</button>
      <button onClick={handleCopyAndPost} disabled={muted}>Copy &amp; Mark Posted</button>
      <button onClick={handleDiscard} disabled={muted}>Discard</button>
      <button onClick={handleRegenerate} disabled={muted || isRegenerating || !!post.pendingVersion}>
        {isRegenerating ? "Regenerating…" : "Regenerate"}
      </button>
      {post.pendingVersion && (
        <div className="pending-compare">
          <p>New version: {post.pendingVersion.originalText}</p>
          <button onClick={() => handleKeep(post.pendingVersion!.id, post.id)}>Keep this one</button>
          <button onClick={() => handleKeep(post.id, post.pendingVersion!.id)}>Keep original</button>
        </div>
      )}
    </div>
  );
}
