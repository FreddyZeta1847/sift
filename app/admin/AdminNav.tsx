/**
 * Section nav for the Admin page — styled as `.admin-tabs` pill buttons,
 * visually matching the Organic system's tab language. These are real
 * routes with active-route styling (mirrors app/Nav.tsx's usePathname
 * pattern, just scoped to /admin/*).
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
    <nav className="admin-tabs" aria-label="Admin sections">
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
