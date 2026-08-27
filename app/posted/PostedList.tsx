/**
 * Read-only card list + pagination for the Posted feed (`/posted`).
 *
 * Deliberately not a reuse of admin/posts/PostsTable.tsx — that's an
 * admin data-grid hardwired to /admin/posts routing and a Delete action.
 * This is a plain content view.
 *
 * It shares its card shell with /review's DraftCard through
 * app/PostCard.tsx. Previously it shared nothing but a class name: this
 * file's markup was a hand-copied subset of DraftCard's, which meant the
 * two could drift apart the first time either was touched alone. Now the
 * only difference between them is what goes in the rail and the body —
 * here, no controls and no editing, because there is nothing left to
 * decide about a post you have already published.
 *
 * Pagination reuses the disabled-button pattern (there's no styled
 * "disabled link" in the design system), which is what makes this a
 * Client Component at all.
 */
"use client";

import { useRouter } from "next/navigation";
import { PostCard } from "../PostCard";
import { EmptyState } from "../EmptyState";
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
      <div className="page-head">
        <div className="page-head-text">
          <h1>Posted</h1>
          {total > 0 && (
            <p className="page-head-sub">
              {total} post{total === 1 ? "" : "s"} published so far.
            </p>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState hint="Posts you mark posted from the Review Workspace show up here.">
          No posts marked as posted yet.
        </EmptyState>
      ) : (
        <>
          {rows.map((post) => (
            <PostCard
              key={post.id}
              rail={
                <>
                  <span className="data id-chip">#{post.id}</span>
                  {post.postedAt && (
                    <span className="data rail-note">Posted {formatPostedAt(post.postedAt)}</span>
                  )}
                </>
              }
            >
              {post.title && <p className="draft-title">{post.title}</p>}
              <p className="status-line inline-row post-card-meta">
                <a className="data" href={post.url} target="_blank" rel="noopener noreferrer">
                  {post.url}
                </a>
                {post.sourceName && <span className="data">{post.sourceName}</span>}
              </p>
              <p className="measure posted-text">{post.editedText ?? post.originalText}</p>
            </PostCard>
          ))}

          {/* Only shown when there is something to page through — a lone
              "Page 1 of 1" under an empty list is noise. */}
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
        </>
      )}
    </main>
  );
}
