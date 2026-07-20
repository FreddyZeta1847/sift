/**
 * Admin — LLM Calls tab (`/admin/llm-calls`). First viewer this table has
 * ever had — the three pre-existing CLI scripts cover runs/candidates/posts
 * but never llm_calls.
 */
import { listLlmCalls } from "../../../lib/admin/queries";
import { LlmCallsTable } from "./LlmCallsTable";

export const dynamic = "force-dynamic";

export default async function AdminLlmCallsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; id?: string; runId?: string; provider?: string; model?: string }>;
}) {
  const params = await searchParams;
  const result = await listLlmCalls({
    page: params.page ? Number(params.page) : undefined,
    id: params.id ? Number(params.id) : undefined,
    runId: params.runId ? Number(params.runId) : undefined,
    provider: params.provider || undefined,
    model: params.model || undefined,
  });

  return <LlmCallsTable {...result} filters={params} />;
}
