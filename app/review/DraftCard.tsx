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
 */
"use client";

import { useState } from "react";
import { saveEdit, discardPost, markPosted } from "./actions";
import { isFlagged } from "../../lib/safety/leakage-linter";
import type { PostWithPending } from "../../lib/review/queries";

export function DraftCard({ post }: { post: PostWithPending }) {
  const [text, setText] = useState(post.editedText ?? post.originalText);
  const [status, setStatus] = useState<string | null>(null);

  const handleBlur = async () => {
    const result = await saveEdit(post.id, text);
    if (!result.ok) setStatus(`Save failed: ${result.error}`);
  };

  const handleDiscard = async () => {
    const result = await discardPost(post.id);
    if (!result.ok) setStatus(`Discard failed: ${result.error}`);
  };

  const handleCopyAndPost = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setStatus("Clipboard write failed — not marked as posted.");
      return;
    }
    const result = await markPosted(post.id);
    if (!result.ok) setStatus(`Copied, but marking posted failed: ${result.error}`);
  };

  const muted = post.posted || post.discarded;

  return (
    <div className={muted ? "card muted" : "card"}>
      {status && <p role="alert">{status}</p>}
      {isFlagged(text) && <span className="badge">content-safety flag</span>}
      <textarea defaultValue={text} onChange={(e) => setText(e.target.value)} onBlur={handleBlur} />
      <p className="prompt">{post.imagePrompt}</p>
      <button onClick={() => navigator.clipboard.writeText(post.imagePrompt)}>Copy prompt</button>
      <button onClick={handleCopyAndPost} disabled={muted}>Copy &amp; Mark Posted</button>
      <button onClick={handleDiscard} disabled={muted}>Discard</button>
    </div>
  );
}
