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
      <div className="config-page">
        <div className="page-head">
          <div className="page-head-text">
            <h1>Admin</h1>
            <p className="page-head-sub">
              Search, filter and delete across the four tables the pipeline writes.
            </p>
          </div>
        </div>
        {/* The tabs sit outside the panel, not on it: they switch which
            panel you are looking at, so they belong to the page. */}
        <AdminNav />
        <div className="panel">{children}</div>
      </div>
    </main>
  );
}
