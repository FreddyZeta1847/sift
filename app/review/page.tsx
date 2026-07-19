/**
 * Review Workspace route (`/review?date=YYYY-MM-DD`).
 *
 * Resolves the pipeline run for the given date (default today) via
 * lib/review/queries and renders its posts as interactive DraftCards
 * (edit-with-autosave, discard, copy-and-mark-posted, and per-post
 * Regenerate with propose/keep/discard — see DraftCard.tsx).
 *
 * Visual pass only (see DESIGN.md): this is the "Study Lamp" system's
 * single most important screen, so the page chrome stays quiet — a
 * display-weight title, a muted status line, then the drafts themselves
 * as cards (the one place in the app cards are earned per the
 * Card-Is-Not-Default rule). Empty states keep using the shared
 * `.empty-state` class but get a short, reassuring sub-line and some
 * breathing room so an empty run doesn't read as a broken page.
 */
import { resolveRunIdForDate, getPostsForRun } from "../../lib/review/queries";
import { DraftCard } from "./DraftCard";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const resolvedDate = date ?? today;
  const runId = await resolveRunIdForDate(resolvedDate);

  if (!runId) {
    return (
      <main>
        <h1>Review — {resolvedDate}</h1>
        <div style={{ paddingTop: "var(--space-md)" }}>
          <p className="empty-state">No pipeline run found for this date.</p>
          <p className="empty-state" style={{ marginTop: "var(--space-xs)" }}>
            Try a different date, or check back once today&apos;s run has completed.
          </p>
        </div>
      </main>
    );
  }

  const posts = await getPostsForRun(runId);

  if (posts.length === 0) {
    return (
      <main>
        <h1>Review — {resolvedDate}</h1>
        <div style={{ paddingTop: "var(--space-md)" }}>
          <p className="empty-state">This run produced no posts.</p>
          <p className="empty-state" style={{ marginTop: "var(--space-xs)" }}>
            Nothing needed review this time — the next run will bring fresh drafts.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Review — {resolvedDate}</h1>
      <p className="status-line" style={{ marginBottom: "var(--space-lg)" }}>
        Run <span className="data">#{runId}</span> — {posts.length} post(s)
      </p>
      {posts.map((post) => (
        <DraftCard key={post.id} post={post} />
      ))}
    </main>
  );
}
