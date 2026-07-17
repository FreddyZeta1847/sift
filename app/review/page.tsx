/**
 * Review Workspace route (`/review?date=YYYY-MM-DD`).
 *
 * Resolves the pipeline run for the given date (default today) via
 * lib/review/queries and renders its posts as interactive DraftCards
 * (edit-with-autosave, discard, copy-and-mark-posted). Regenerate is not
 * built here — it lands in a later task once its Server Action exists.
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
        <p className="empty-state">No pipeline run found for this date.</p>
      </main>
    );
  }

  const posts = await getPostsForRun(runId);

  if (posts.length === 0) {
    return (
      <main>
        <h1>Review — {resolvedDate}</h1>
        <p className="empty-state">This run produced no posts.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Review — {resolvedDate}</h1>
      <p>Run #{runId} — {posts.length} post(s)</p>
      {posts.map((post) => (
        <DraftCard key={post.id} post={post} />
      ))}
    </main>
  );
}
