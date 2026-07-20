/**
 * Admin — Candidates tab (`/admin/candidates`).
 */
import { listCandidates } from "../../../lib/admin/queries";
import { CandidatesTable } from "./CandidatesTable";

export const dynamic = "force-dynamic";

export default async function AdminCandidatesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string; runId?: string; chosen?: string; q?: string }>;
}) {
  const params = await searchParams;
  const result = await listCandidates({
    page: params.page ? Number(params.page) : undefined,
    id: params.id ? Number(params.id) : undefined,
    runId: params.runId ? Number(params.runId) : undefined,
    chosen: params.chosen === "true" ? true : params.chosen === "false" ? false : undefined,
    q: params.q || undefined,
  });

  return <CandidatesTable {...result} filters={params} />;
}
