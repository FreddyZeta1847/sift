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
 * This is the app's single most important screen, so the page chrome stays
 * quiet: a title, one toolbar, then nothing but the drafts.
 *
 * The run picker lives in that toolbar — a full-width strip whose left and
 * right edges line up with the cards below it, carrying the picker on the
 * left and the count of what's left to decide on the right. It has been in
 * three places now. It began as a bare labelled `<select>` floating
 * between the title and the first card, which read as a filter belonging
 * to the list rather than the control that chooses the list. It was then
 * tried on the right of the page head, opposite the h1 — but a small pill
 * beside a large display title lines up with nothing, which is exactly
 * what it looked like. In the toolbar it shares an edge with every card on
 * the page, which is the alignment it was missing both times.
 *
 * Empty states go through `<EmptyState>`, which keeps the reassuring
 * second line structural rather than a convention each branch has to
 * remember — an empty run should never read as a broken page.
 */
import { redirect } from "next/navigation";
import { resolveRunIdForDate, getPostsForRun, getRecentRuns } from "../../lib/review/queries";
import { EmptyState } from "../EmptyState";
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

  // Pin an unpinned ("today"/date-resolved) visit to its resolved run right
  // away — otherwise a later Nav router.refresh() (fired when a new run
  // finishes) would re-run resolveRunIdForDate and silently swap the drafts
  // out from under whoever is mid-review, since it always prefers the
  // latest successful run for the date. Once the URL carries an explicit
  // runId, refreshes keep showing the same run; a new run finishing is only
  // ever surfaced via the sidebar's completion toast.
  if (!runIdParam && runId) {
    redirect(`/review?runId=${runId}`);
  }

  if (!runId) {
    return (
      <main>
        <ReviewHead runs={recentRuns} currentRunId={null} />
        <EmptyState hint="Try a different date, or pick an older run above.">
          No pipeline run found for {resolvedDate}.
        </EmptyState>
      </main>
    );
  }

  const posts = await getPostsForRun(runId);

  if (posts.length === 0) {
    return (
      <main>
        <ReviewHead runs={recentRuns} currentRunId={runId} />
        <EmptyState hint="Nothing needed review this time — pick another run above, or check back once the next run has completed.">
          This run produced no posts.
        </EmptyState>
      </main>
    );
  }

  const undecided = posts.filter((p) => !p.posted && !p.discarded).length;

  return (
    <main>
      <ReviewHead runs={recentRuns} currentRunId={runId} count={undecided} total={posts.length} />
      {posts.map((post) => (
        <DraftCard key={post.id} post={post} />
      ))}
    </main>
  );
}

/**
 * The title and toolbar, identical across all three branches above.
 *
 * The count on the right counts only *undecided* drafts, because that is
 * the number that tells you whether you are done. It is derived from the
 * posts this page already has in hand, so it costs no extra query.
 */
function ReviewHead({
  runs,
  currentRunId,
  count,
  total,
}: {
  runs: Awaited<ReturnType<typeof getRecentRuns>>;
  currentRunId: number | null;
  count?: number;
  total?: number;
}) {
  return (
    <>
      <div className="page-head">
        <div className="page-head-text">
          <h1>Review</h1>
          <p className="page-head-sub">Edit what the pipeline drafted, then copy it out.</p>
        </div>
      </div>
      <div className="toolbar">
        <RunPicker runs={runs} currentRunId={currentRunId} />
        {count !== undefined && total !== undefined && (
          <span className="toolbar-note">
            {count === 0
              ? `All ${total} decided`
              : `${count} of ${total} still to decide`}
          </span>
        )}
      </div>
    </>
  );
}
