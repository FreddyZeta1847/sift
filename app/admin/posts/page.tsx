/**
 * Admin — Posts tab (`/admin/posts`).
 */
import { listPosts } from "../../../lib/admin/queries";
import { PostsTable } from "./PostsTable";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string; runId?: string; posted?: string; discarded?: string; q?: string }>;
}) {
  const params = await searchParams;
  const result = await listPosts({
    page: params.page ? Number(params.page) : undefined,
    id: params.id ? Number(params.id) : undefined,
    runId: params.runId ? Number(params.runId) : undefined,
    posted: params.posted === "true" ? true : params.posted === "false" ? false : undefined,
    discarded: params.discarded === "true" ? true : params.discarded === "false" ? false : undefined,
    q: params.q || undefined,
  });

  return <PostsTable {...result} filters={params} />;
}
