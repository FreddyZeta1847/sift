/**
 * Read-only card list + pagination for the Posted feed (`/posted`).
 *
 * Deliberately not a reuse of admin/posts/PostsTable.tsx — that's an
 * admin data-grid hardwired to /admin/posts routing and a Delete action.
 * This is a plain content view, so it borrows DraftCard's card/typography
 * classes (title, id chip, source link, body text) without any of its
 * interactive editing/action affordances. Pagination reuses PostsTable's
 * own disabled-button pattern (there's no styled "disabled link" in the
 * design system), which needs client-side navigation.
 */
"use client";

import { useRouter } from "next/navigation";
import type { PostRowWithSource } from "../../lib/admin/queries";

function formatPostedAt(date: Date | null): string {
  if (!date) return "";
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PostedList({
  rows,
  total,
  page,
  pageSize,
}: {
  rows: PostRowWithSource[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const goToPage = (p: number) => router.push(`/posted?page=${p}`);

  return (
    <main>
      <h1>Posted</h1>
      {rows.length === 0 ? (
        <div style={{ paddingTop: "var(--space-md)" }}>
          <p className="empty-state">No posts marked as posted yet.</p>
          <p className="empty-state" style={{ marginTop: "var(--space-xs)" }}>
            Posts you mark posted from the Review Workspace show up here.
          </p>
        </div>
      ) : (
        rows.map((post) => (
          <article key={post.id} className="card draft-card">
            {post.title && <p className="draft-title">{post.title}</p>}
            <p
              className="status-line"
              style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap", marginTop: 0 }}
            >
              <span className="data id-chip">#{post.id}</span>
              <a className="data" href={post.url} target="_blank" rel="noopener noreferrer">
                {post.url}
              </a>
              {post.sourceName && <span className="data">{post.sourceName}</span>}
              {post.postedAt && <span className="data">Posted {formatPostedAt(post.postedAt)}</span>}
            </p>
            <p style={{ maxWidth: "70ch", whiteSpace: "pre-wrap" }}>{post.editedText ?? post.originalText}</p>
          </article>
        ))
      )}

      <div className="pagination">
        <button onClick={() => goToPage(page - 1)} disabled={page <= 1}>
          Prev
        </button>
        <span className="data">
          Page {page} of {totalPages} ({total} total)
        </span>
        <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages}>
          Next
        </button>
      </div>
    </main>
  );
}
