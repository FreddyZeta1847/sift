/**
 * Review Workspace route (`/review?date=YYYY-MM-DD`).
 *
 * Read-only for now: resolves the pipeline run for the given date (default
 * today) via lib/review/queries and renders its posts as a plain list.
 * The interactive card (edit/discard/copy/regenerate) is intentionally
 * NOT built here — it lands in later tasks once its Server Actions exist,
 * so this route only needs to prove the data layer wires up end to end.
 */
import { resolveRunIdForDate, getPostsForRun } from "../../lib/review/queries";

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
      <ul>
        {posts.map((p) => (
          <li key={p.id}>{p.url} {p.pendingVersion ? "(has a pending regenerate)" : ""}</li>
        ))}
      </ul>
    </main>
  );
}
