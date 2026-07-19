/**
 * Site navigation — single-row top nav, active route underlined in
 * primary (see DESIGN.md §5, "Navigation"). Client Component: active-route
 * detection needs next/navigation's usePathname hook.
 */
"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/review", label: "Review" },
  { href: "/config/api", label: "API Config" },
  { href: "/config/settings", label: "Settings" },
  { href: "/config/costs", label: "Costs" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="site-nav">
      {LINKS.map((link) => (
        <a key={link.href} href={link.href} className={pathname === link.href ? "active" : undefined}>
          {link.label}
        </a>
      ))}
    </nav>
  );
}
