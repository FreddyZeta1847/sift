/**
 * The empty state shown when a list has nothing in it.
 *
 * Always two lines, never one. The headline says what is missing; the
 * second line says what to do about it, or why it is fine. That pairing
 * was already the convention everywhere in this app — "This run produced
 * no posts." followed by "Nothing needed review this time — pick another
 * run above, or check back once the next run has completed." — but it was
 * hand-copied into six files, so it survived only as long as whoever
 * wrote the next empty list happened to notice. Here it is structural:
 * `hint` is a required prop, so an empty state cannot be written without
 * one.
 *
 * Deliberately not a Client Component: it has no state and no handlers,
 * so it renders on the server wherever its caller does.
 */

interface EmptyStateProps {
  /** What is missing. A full sentence. */
  children: React.ReactNode;
  /** What to do about it, or why it's fine. A full sentence. */
  hint: React.ReactNode;
}

export function EmptyState({ children, hint }: EmptyStateProps) {
  return (
    <div className="empty-state-block">
      <p className="empty-state">{children}</p>
      <p className="empty-state-hint">{hint}</p>
    </div>
  );
}
