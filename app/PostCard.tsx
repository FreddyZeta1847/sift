/**
 * The card that both post lists are built from: the editable one on
 * `/review` (DraftCard) and the read-only one on `/posted` (PostedList).
 *
 * WHY IT EXISTS
 * Those two files each had their own copy of the same card markup —
 * title, `#id` chip, source link — because Posted was written by copying
 * the top of DraftCard and deleting the interactive parts. Two copies of
 * one card is a guarantee that changing one and forgetting the other will
 * eventually happen. Now there is one shell and two sets of contents.
 *
 * THE SHAPE — three bands, divided by hairlines
 *   head    what the post *is*: id, source, language
 *   body    what the post *says*: title, the text itself
 *   footer  what you can *do* to it (Review only; Posted omits it)
 *
 * The bands are the whole point. Before, a card was one undivided run of
 * paragraphs where a `#id` chip, a title, the draft text and a row of
 * buttons all sat at the same level with only margins between them, so
 * nothing told you where the metadata stopped and the writing began. Two
 * hairlines do that, and cost nothing else.
 *
 * An earlier attempt put the metadata and actions in a narrow left rail
 * instead, as a two-column card. It was rejected on sight: it pushed the
 * actions far from the text they act on, and the rail was mostly empty on
 * a short draft. Bands keep the reading column full-width, which is what
 * a page of long post drafts actually wants.
 */

interface PostCardProps {
  /** Identity: id chip, source link, language badge. */
  head: React.ReactNode;
  /** Content: title, the post text. */
  children: React.ReactNode;
  /** Actions. Omitted entirely on a read-only card, hairline and all. */
  footer?: React.ReactNode;
  /** Posted or discarded — the card recedes but stays readable. */
  muted?: boolean;
}

export function PostCard({ head, children, footer, muted = false }: PostCardProps) {
  return (
    <article className={muted ? "post-card muted" : "post-card"}>
      <div className="post-card-head">{head}</div>
      <div className="post-card-body">{children}</div>
      {footer && <div className="post-card-foot">{footer}</div>}
    </article>
  );
}
