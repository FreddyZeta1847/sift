/**
 * Section nav for the Admin page — page-local `.config-nav`, but unlike
 * every other use of that class (Settings/API Config/Costs, all in-page
 * scroll anchors), these are real routes with active-route styling
 * (mirrors app/Nav.tsx's usePathname pattern, just scoped to /admin/*).
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Pipeline Runs" },
  { href: "/admin/candidates", label: "Candidates" },
  { href: "/admin/posts", label: "Posts" },
  { href: "/admin/llm-calls", label: "LLM Calls" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="config-nav" aria-label="Admin sections">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
