# Product

## Register

product

## Users

A single self-hoster — the person who deployed sift for their own use — checking in once or more per day, on their own machine or server, to review that day's AI-drafted LinkedIn posts, tweak configuration (sources, schedule, LLM providers, voice profile), and keep an eye on spend. There is no second user, no team, no public-facing surface anywhere in the product.

## Product Purpose

sift is a self-hosted pipeline that ingests RSS feeds, uses an LLM to curate and draft LinkedIn posts in the user's own voice, and surfaces them for human review — the user always edits/approves/discards and posts manually, sift never auto-publishes. Success looks like: in under a minute, the user can review a day's drafts, make an edit or two, and either copy-and-post or discard — with full visibility into pipeline health (runs, costs, budget) and full control over configuration, without ever touching a file or writing SQL.

## Brand Personality

Warm & personal, content-first, quietly confident. The drafts, sources, and numbers are the star — chrome recedes. Not corporate-SaaS-generic, and not sterile dev-tool-cold despite defaulting to dark — think a well-crafted personal writing studio, not an admin panel or an ops dashboard.

## Anti-references

- Generic SaaS-dashboard chrome: heavy sidebars, endless identical card grids, gradient hero banners — none of these apply since sift has no marketing surface at all.
- The "cold dark mode" cliché: navy-black backgrounds, neon-blue/cyan accents, terminal-green, a dev-ops/monitoring-console feel. The personality calls for warmth in the dark register, not a SRE dashboard.
- Cluttered enterprise-admin density — sift has exactly one user; nothing here needs the information density of a multi-tenant admin console.

## Design Principles

1. **Content is the star.** Drafts, source lists, cost numbers carry the visual weight; navigation and structural chrome stay quiet.
2. **Warmth in a dark register.** Dark-by-default (fits daily, repeated checking) but never cold — warmth comes from color temperature, typography, and small personal touches, not from lightening the theme.
3. **One user, zero training.** Every screen must be immediately legible to the one person who uses it daily — no onboarding flow, no repeated explanatory copy.
4. **Trust through transparency.** Sift touches live API keys and real spend, and never auto-posts — budget/cost state and any action with real consequence (discard, mark-as-posted) should always be visible, never hidden behind an extra click.
5. **Quiet confidence.** A restrained color strategy — tinted neutrals plus one deliberate accent — with hierarchy carried by type and spacing rather than heavy visual devices (no gradients, no glassmorphism, no card-of-cards).

## Accessibility & Inclusion

WCAG AA contrast minimum throughout, full keyboard navigation, and `prefers-reduced-motion` respected for all motion. No additional specific accessibility requirements beyond solid defaults.
