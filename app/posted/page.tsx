/**
 * Posted (`/posted?page=N`) — read-only feed of every post marked as
 * posted (DraftCard's "Copy & Mark Posted"), newest first.
 *
 * Reuses the paginated `listPosts` query from the admin data layer with
 * a fixed `posted: true` filter, but renders through PostedList rather
 * than admin/posts/PostsTable — this is a top-level content view for
 * browsing what's gone out, not an admin data-grid, so it carries no
 * filters and no delete action.
 */
import { listPosts } from "../../lib/admin/queries";
import { PostedList } from "./PostedList";

export const dynamic = "force-dynamic";

export default async function PostedPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const result = await listPosts({
    posted: true,
    page: pageParam ? Number(pageParam) : undefined,
  });

  return <PostedList {...result} />;
}
