/**
 * The two-column card that both post lists are built from: the editable
 * one on `/review` (DraftCard) and the read-only one on `/posted`
 * (PostedList).
 *
 * WHY IT EXISTS
 * Those two files each had their own copy of the same card markup —
 * title, `#id` chip, source link — because Posted was written by copying
 * the top of DraftCard and deleting the interactive parts. Two copies of
 * one card is a guarantee that changing one and forgetting the other will
 * eventually happen. Now there is one shell and two sets of contents.
 *
 * THE SHAPE
 * A narrow left rail carries what the post *is* and what you can *do* to
 * it — the id, the language badge, the action buttons. The right column
 * carries what the post *says* — title, source, the draft text itself.
 * Keeping the chrome out of the reading column is the point: the draft
 * text is the one thing on this page anyone actually reads, and it now
 * runs from the top of its column to the bottom without a row of buttons
 * cutting across it.
 *
 * Below 760px there is no room for two columns, so the rail lies down
 * into a horizontal strip above the body.
 */

interface PostCardProps {
  /** Identity and controls: id chip, language badge, action buttons. */
  rail: React.ReactNode;
  /** Content: title, source, text. */
  children: React.ReactNode;
  /** Posted or discarded — the card recedes but stays readable. */
  muted?: boolean;
}

export function PostCard({ rail, children, muted = false }: PostCardProps) {
  return (
    <article className={muted ? "post-card muted" : "post-card"}>
      <div className="post-card-rail">{rail}</div>
      <div className="post-card-body">{children}</div>
    </article>
  );
}
