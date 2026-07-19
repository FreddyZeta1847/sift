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
 *
 * Visual pass only (see DESIGN.md): the draft text is this card's "one lit
 * thing" — read at body typography, capped to a ~70ch measure, everything
 * else (badge, prompt, buttons) recedes around it. "Copy & Mark Posted" is
 * the card's one primary action; "Discard" stays a ghost/danger button
 * (never filled, per the Flat-By-Default / danger-button rules — a filled
 * red Discard would read as a false alarm); "Regenerate" and "Copy prompt"
 * are plain ghost buttons. The content-safety badge sits at the top of the
 * card, on its own line, so it can't be missed. The pending-version compare
 * is visually separated by `.pending-compare`'s top border and stacked
 * clearly under the current draft so "keep new" vs. "keep original" reads
 * unambiguously.
 *
 * The draft textarea auto-grows to its content's `scrollHeight` (see the
 * `resizeTextarea` effect below) instead of sitting at a fixed height with
 * an inner scrollbar — a typical post-length draft is this tool's single
 * most important reading surface, so it should read in full at a glance.
 * The image prompt below it is wrapped in `.image-prompt` with an explicit
 * icon + label, since an unlabeled italic line was easy to mistake for a
 * caption or secondary draft text rather than what it actually is: the
 * prompt for the post's AI-generated photo. None of this touches the
 * handlers, state, props, or the conditions that gate them below.
 */
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveEdit, discardPost, markPosted, regeneratePost, keepVersion } from "./actions";
import { isFlagged } from "../../lib/safety/leakage-linter";
import type { PostWithPending } from "../../lib/review/queries";

export function DraftCard({ post }: { post: PostWithPending }) {
  const router = useRouter();
  const [text, setText] = useState(post.editedText ?? post.originalText);
  const [status, setStatus] = useState<string | null>(null);
  const [isRegenerating, startTransition] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // next/font loads Figtree with `display: "swap"` — the fallback system
  // font renders first, so the height computed on mount can be too short
  // once Figtree swaps in and reflows the text (different metrics can wrap
  // it onto more lines). Re-measure once fonts finish loading; harmless if
  // they were already ready by then. Without this, `overflow: hidden` on
  // `.draft-textarea` silently clips the bottom of the draft instead of
  // scrolling, which is worse than the original fixed-height textarea.
  useEffect(() => {
    const resize = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(resize);
    }
    // A window resize can also change how many lines the text wraps to at
    // the card's fixed max-width, so the frozen height needs recomputing.
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

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
  const flagged = isFlagged(text);

  return (
    <article className={muted ? "card muted" : "card"}>
      {status && (
        <p role="alert" style={{ marginTop: 0, marginBottom: "var(--space-sm)", fontWeight: 500 }}>
          {status}
        </p>
      )}

      {muted && (
        <p className="status-line" style={{ marginTop: 0 }}>
          {post.discarded ? "Discarded" : "Posted"}
        </p>
      )}

      {flagged && (
        <div style={{ marginBottom: "var(--space-sm)" }}>
          <span className="badge">content-safety flag</span>
        </div>
      )}

      <div style={{ maxWidth: "70ch" }}>
        <textarea
          ref={textareaRef}
          className="draft-textarea"
          defaultValue={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
        />
      </div>

      <div className="image-prompt" style={{ maxWidth: "70ch" }}>
        <span className="image-prompt-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          Image prompt
        </span>
        <p className="image-prompt-text">{post.imagePrompt}</p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
          marginTop: "var(--space-md)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <button onClick={handleCopyPrompt}>Copy prompt</button>
          <button onClick={handleRegenerate} disabled={muted || isRegenerating || !!post.pendingVersion}>
            {isRegenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
          <button className="danger" onClick={handleDiscard} disabled={muted}>Discard</button>
          <button className="primary" onClick={handleCopyAndPost} disabled={muted}>Copy &amp; Mark Posted</button>
        </div>
      </div>

      {post.pendingVersion && (
        <div className="pending-compare">
          <p className="status-line" style={{ marginTop: 0 }}>New version:</p>
          <p style={{ maxWidth: "70ch" }}>{post.pendingVersion.originalText}</p>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <button onClick={() => handleKeep(post.pendingVersion!.id, post.id)}>Keep this one</button>
            <button onClick={() => handleKeep(post.id, post.pendingVersion!.id)}>Keep original</button>
          </div>
        </div>
      )}
    </article>
  );
}
