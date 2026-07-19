/**
 * Review Workspace route (`/review?date=YYYY-MM-DD` or `/review?runId=N`).
 *
 * Resolves which pipeline run to show — a direct `runId` param takes
 * precedence (the run picker navigates this way); otherwise falls back to
 * resolving the given date (default today) via lib/review/queries. Renders
 * that run's posts as interactive DraftCards (edit-with-autosave, discard,
 * copy-and-mark-posted, and per-post Regenerate with propose/keep/discard —
 * see DraftCard.tsx).
 *
 * The `RunPicker` (see RunPicker.tsx) renders in every branch below,
 * including the empty states — a run with no posts, or no run resolved for
 * today's date, still needs a way to jump to a different (older) run rather
 * than dead-ending the page. It's fed the full recent-run list up front so
 * switching runs is a single navigation, no extra fetch.
 *
 * Visual pass only (see DESIGN.md): this is the "Study Lamp" system's
 * single most important screen, so the page chrome stays quiet — a
 * display-weight title, a muted status line, then the drafts themselves
 * as cards (the one place in the app cards are earned per the
 * Card-Is-Not-Default rule). Empty states keep using the shared
 * `.empty-state` class but get a short, reassuring sub-line and some
 * breathing room so an empty run doesn't read as a broken page.
 */
import { resolveRunIdForDate, getPostsForRun, getRecentRuns } from "../../lib/review/queries";
import { DraftCard } from "./DraftCard";
import { RunPicker } from "./RunPicker";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; runId?: string }>;
}) {
  const { date, runId: runIdParam } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const resolvedDate = date ?? today;

  const recentRuns = await getRecentRuns();
  const runId = runIdParam ? Number(runIdParam) : await resolveRunIdForDate(resolvedDate);

  if (!runId) {
    return (
      <main>
        <h1>Review</h1>
        <RunPicker runs={recentRuns} currentRunId={null} />
        <div style={{ paddingTop: "var(--space-md)" }}>
          <p className="empty-state">No pipeline run found for {resolvedDate}.</p>
          <p className="empty-state" style={{ marginTop: "var(--space-xs)" }}>
            Try a different date, or pick an older run above.
          </p>
        </div>
      </main>
    );
  }

  const posts = await getPostsForRun(runId);

  if (posts.length === 0) {
    return (
      <main>
        <h1>Review</h1>
        <RunPicker runs={recentRuns} currentRunId={runId} />
        <div style={{ paddingTop: "var(--space-md)" }}>
          <p className="empty-state">This run produced no posts.</p>
          <p className="empty-state" style={{ marginTop: "var(--space-xs)" }}>
            Nothing needed review this time — pick another run above, or check back once the next run has completed.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main>
      <h1>Review</h1>
      <RunPicker runs={recentRuns} currentRunId={runId} />
      {posts.map((post) => (
        <DraftCard key={post.id} post={post} />
      ))}
    </main>
  );
}
