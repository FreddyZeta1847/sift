/**
 * Admin — Pipeline Runs tab (`/admin` itself, no redirect needed).
 */
import { listRuns } from "../../lib/admin/queries";
import { RunsTable } from "./RunsTable";

export const dynamic = "force-dynamic";

export default async function AdminRunsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string; type?: string; status?: string; date?: string }>;
}) {
  const params = await searchParams;
  const result = await listRuns({
    page: params.page ? Number(params.page) : undefined,
    id: params.id ? Number(params.id) : undefined,
    type: params.type as "scheduled" | "catchup" | "manual" | "regenerate-posts" | undefined,
    status: params.status as "success" | "aborted" | "incomplete" | undefined,
    date: params.date || undefined,
  });

  return <RunsTable {...result} filters={params} />;
}
