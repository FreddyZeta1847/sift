/**
 * Admin section shell (`/admin` and its sub-routes) — search/filter/delete
 * across all four SQLite tables (pipeline_runs, candidates, posts,
 * llm_calls). See vault-sift/features/CONFIG-UI/CONFIG-UI--admin-page.md
 * for the full design rationale, in particular the delete-integrity policy
 * enforced server-side in lib/admin/delete.ts.
 *
 * Deliberately four separate routes (this layout + one page.tsx per table)
 * rather than one anchor-nav page like Settings/API Config: each table
 * paginates and filters independently via its own `searchParams`, so
 * cramming all four into one page would mean every filter change on any
 * one table re-fetches the other three for nothing.
 */
import { AdminNav } from "./AdminNav";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <main>
      <h1>Admin</h1>
      <div className="config-page config-page--with-nav">
        <AdminNav />
        <div className="config-content">{children}</div>
      </div>
    </main>
  );
}
