---
name: sift
description: A warm, quiet dark studio for reviewing AI-drafted LinkedIn posts.
colors:
  bg: "oklch(0.09 0 0)"
  surface: "oklch(0.14 0.006 75)"
  surface-raised: "oklch(0.18 0.007 75)"
  border: "oklch(0.27 0.006 75)"
  ink: "oklch(0.93 0.012 80)"
  muted: "oklch(0.60 0.008 78)"
  primary: "oklch(0.58 0.10 228)"
  primary-deep: "oklch(0.48 0.09 228)"
  primary-text: "oklch(0.97 0.01 80)"
  accent: "oklch(0.68 0.15 45)"
  accent-deep: "oklch(0.58 0.14 45)"
  accent-text: "oklch(0.98 0.01 70)"
  success: "oklch(0.62 0.12 145)"
  danger: "oklch(0.62 0.16 25)"
typography:
  display:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Figtree, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  badge-accent:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.sm}"
    padding: "2px 10px"
---

# Design System: sift

## 1. Overview

**Creative North Star: "The Study Lamp"**

A single warm reading lamp on in an otherwise dark, quiet room — that's the whole system in one image. sift is checked by exactly one person, most likely at the end of a day, to read a handful of drafted posts, glance at what they cost, and either send them or let them go. The room (the interface) stays out of the way — near-black, unlit, structurally quiet — so the one lit thing (the draft text, the number that matters, the action you're actually here to take) is what the eye lands on.

This explicitly rejects the two obvious paths a tool like this could fall into: the **cold ops-dashboard** look (navy-black surfaces, cyan/neon accents, monitoring-console density — sift is not an SRE tool, and looking like one would misrepresent what using it feels like), and the **generic SaaS-product** look (gradient hero banners, identical stat-tile card grids, a tiny uppercase eyebrow over every section — none of which sift has any use for, since it has no marketing surface at all and exactly one screen's worth of context to hold at a time).

Warmth here doesn't come from a beige/cream surface — that reads as an AI-generated palette on sight and this system is dark by default regardless. It comes from three deliberate places instead: a genuinely warm off-white ink color (never cold gray-white), a warm ember accent used only where the product actually touches the personal (your voice, your drafts, your decision to post), and a rounded humanist typeface instead of a geometric or grotesque one.

**Key Characteristics:**
- Near-black, zero-chroma background — the room is dark, not navy, not charcoal-blue.
- One structural color (a deep, muted cobalt) used sparingly for navigation and primary actions — present, never glowing.
- One warm color (a terracotta ember) reserved for the moments that are actually personal to the user — never used as generic UI decoration.
- Cards used only where content is genuinely discrete and comparable (draft posts in Review) — not as default scaffolding for settings or config.
- Flat by default; depth comes from tonal layering (three surface steps), not shadows.

## 2. Colors

A restrained strategy: tinted near-black neutrals carry the room, one muted structural color carries navigation and primary actions, and one warm accent is spent only on what's genuinely personal to the user. Together, primary and accent should never occupy more than roughly 10% of any given screen.

### Primary
- **Harbor Cobalt** (`oklch(0.58 0.10 228)`): the one structural brand color — active nav state, primary buttons ("Save", "Run Now", "Copy & Mark Posted"), links. Deliberately muted (chroma 0.10, not glowing) so it reads as quietly confident rather than loud. Deeper variant **Harbor Cobalt Deep** (`oklch(0.48 0.09 228)`) is the hover/active state.

### Accent
- **Ember** (`oklch(0.68 0.15 45)`): reserved for what's actually personal — the voice-profile section, a newly-drafted post's "new" indicator, the one moment the reviewer is about to send something in their own name. This is deliberately the only genuinely warm, saturated color in the system; if it starts appearing on more than a handful of elements per screen, that's a sign it's being used as decoration instead of meaning. Deeper variant **Ember Deep** (`oklch(0.58 0.14 45)`) is the hover/active state.

### Neutral
- **Deep Room** (`oklch(0.09 0 0)`, `bg`): the base background. Pure zero-chroma near-black — no navy tint, no warm tint. The warmth in this system lives in ink and accent, never in the surface itself.
- **Lamp Surface** (`oklch(0.14 0.006 75)`, `surface`): card and panel background, one step up from the room. Barely-perceptible warm undertone (chroma 0.006) — present enough to avoid a cold, clinical black, never enough to read as "brown."
- **Lamp Surface Raised** (`oklch(0.18 0.007 75)`, `surface-raised`): a second step up, for a surface sitting on top of another surface (e.g. a modal over a card) — tonal layering does the work shadows would otherwise do.
- **Border** (`oklch(0.27 0.006 75)`): the only line-drawing color in the system. Used for dividers and input outlines — never as a colored accent stripe.
- **Warm Paper** (`oklch(0.93 0.012 80)`, `ink`): body text. A genuinely warm off-white, not cold gray — this is one of the two places warmth actually lives.
- **Ash** (`oklch(0.60 0.008 78)`, `muted`): secondary/meta text — timestamps, helper copy, counts.

### Named Rules
**The One Lit Thing Rule.** Any given screen gets exactly one accent-colored element competing for attention, never several. If two things on a screen are both Ember, one of them is wrong.

**The No Warm Surface Rule.** Warmth lives in ink and accent, never in `bg`. If a background color starts reading as "brown" or "cream," its chroma is too high — pull it back toward zero.

## 3. Typography

**Body/UI Font:** Figtree (with system-ui, sans-serif fallback)
**Data Font:** IBM Plex Mono (with ui-monospace fallback) — narrow use only: costs, dates, run IDs, model names.

**Character:** One warm, rounded humanist sans carries the entire interface at multiple weights — deliberately not Inter, not a geometric grotesque; Figtree's soft terminals are what make "warm & personal" legible in typography rather than just in color. The monospace is a functional exception for tabular/numeric data, not a second brand voice.

### Hierarchy
- **Display** (600, `clamp(1.75rem, 3vw, 2.5rem)`, 1.15): page titles only — one per page ("Review — 2026-07-19", "Settings").
- **Headline** (600, 1.25rem, 1.3): section headings within a page (e.g. "Voice Profile", "Sources").
- **Body** (400, 1rem, 1.6): draft text, form labels, all reading content. Capped at 70ch measure for anything paragraph-length — draft posts are read in full here, this is the line length that matters most in the whole system.
- **Label** (500, 0.8125rem, 1.4, +0.01em): form field labels, button text, nav items.
- **Data** (400, 0.875rem, mono): cost figures, timestamps, run IDs — anywhere a column of numbers needs to align.

### Named Rules
**The One Voice Rule.** Every weight and size on screen comes from the Figtree family. The moment a second sans-serif appears, the system has drifted.

## 4. Elevation

Flat by default. Depth is conveyed through the three-step tonal ladder (`bg` → `surface` → `surface-raised`), not shadows — a dark, near-black system relies on shadows least of all, since black-on-black shadows barely register. The one place a shadow earns its keep is a genuinely floating element (a toast, a popover menu) that needs to visually separate from everything behind it regardless of tone.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px oklch(0 0 0 / 0.45)`): toasts, dropdown menus, anything rendered via `position: fixed` above the page's own stacking context.

### Named Rules
**The Flat-By-Default Rule.** A card sits at rest with zero shadow, distinguished from `bg` only by its `surface` tone and, where useful, a 1px `border`. Shadows appear only on elements that float above the document flow, never as a decorative lift on ordinary content.

## 5. Components

Tactile but quiet: every interactive element has a clear, immediate hover/focus response, but nothing on the page performs for attention at rest.

### Buttons
- **Shape:** gently rounded (6px, `{rounded.sm}`) — soft enough to feel personal, not so round it reads as a pill/toy.
- **Primary:** Harbor Cobalt fill, Warm Paper–adjacent near-white text (`primary-text`), 10px/20px padding. Used once per view for the one action that matters most ("Run Now," "Save," "Copy & Mark Posted").
- **Ghost (default secondary):** transparent background, `ink` text, 1px `border` on hover only — this is the button used everywhere that isn't the one primary action (edit, regenerate, cancel).
- **Danger (ghost variant):** transparent background, `danger` text — reserved specifically for "Discard." Never filled; a filled red button reads as an alarm this product doesn't need to sound.
- **Hover/Focus:** background steps to the `-deep` variant (primary/accent) over 150ms `ease-out-quart`; ghost buttons gain a 1px `border` and a barely-there `surface-raised` background. Focus-visible always gets a 2px `primary` outline offset 2px, regardless of pointer hover state.

### Cards
- **Corner Style:** 10px (`{rounded.md}`).
- **Background:** `surface`, one flat tone above `bg`.
- **Shadow Strategy:** none at rest (see Elevation's Flat-By-Default Rule).
- **Border:** none by default; a 1px `border` only appears on a card in a "muted/archived" state, to distinguish it without relying on opacity alone.
- **Internal Padding:** 20px (`{spacing.md}`–`{spacing.lg}` range).
- **Where used:** only the Review Workspace's draft posts — each is a genuinely discrete, comparable item. Config pages (Settings, API Config, Costs) do **not** use cards for their sections; they use headline + spacing rhythm instead, per the Card-Is-Not-Default rule below.

### Inputs / Fields
- **Style:** `surface` background, 1px `border`, 6px radius, `ink` text, `muted`-colored placeholder that still clears 4.5:1 contrast (never the faded gray-on-gray placeholder default).
- **Focus:** border shifts to `primary`, plus a soft 3px `primary` glow at 20% opacity — no layout shift.
- **Error:** border shifts to `danger`; helper text below the field in `danger`, never a red border alone (color is never the only signal).

### Navigation
- **Style:** a single-row top nav, `surface` background, 1px `border` bottom edge. Items in `label` typography; the active route gets `primary`-colored text and a 2px `primary` underline — no pill background, no sidebar.
- **Hover:** text shifts from `muted` to `ink` (never straight to `primary` — that's reserved for the active state only).

### Badges
- **Style:** small pill (`{rounded.sm}`, not fully round), `accent` fill with `accent-text`, reserved for the "new/unreviewed" marker on a draft and the content-safety linter's warning flag — nowhere else. A status badge for pipeline runs (success/failed/aborted) uses `success`/`danger`/`muted` fills respectively at the same shape, not `accent` (accent stays reserved for the personal/voice moments per the One Lit Thing Rule).

### Named Rules
**The Card-Is-Not-Default Rule.** A card is earned by content that is genuinely a standalone, comparable unit (a draft post). A settings section, a list of sources, a cost summary — none of these are "a card," they're a headline and some spacing. Wrapping every block of content in a bordered box is the default AI-generated-dashboard failure this system explicitly avoids.

## 6. Do's and Don'ts

### Do:
- **Do** keep `bg` at exactly `oklch(0.09 0 0)` — zero chroma, no navy or brown tint.
- **Do** spend `accent` (Ember) only on genuinely personal moments — voice profile, new-draft indicators, the send/post confirmation. If you're reaching for Ember to make a section "pop," that's the wrong instinct.
- **Do** use tonal layering (`bg` → `surface` → `surface-raised`) for depth, never a shadow on ordinary at-rest content.
- **Do** cap draft/body text at ~70ch measure — this is a tool for reading full post drafts, and line length is the single biggest readability lever here.
- **Do** respect `prefers-reduced-motion`: every hover/transition needs an instant-swap fallback.

### Don't:
- **Don't** tint the background warm "for coziness" — that's the cream/sand/parchment AI cliché, and this system is dark by default specifically to avoid it.
- **Don't** wrap Settings, API Config, or Costs sections in cards — see the Card-Is-Not-Default Rule. Headline + spacing only.
- **Don't** use a filled red button for Discard — ghost + `danger` text only. This product should never look like it's sounding an alarm.
- **Don't** add a gradient anywhere (text, buttons, backgrounds) — sift has exactly one review-tool job, nothing here is a marketing surface that needs a gradient's decorative lift.
- **Don't** add glassmorphism, backdrop-blur cards, or any second typeface alongside Figtree.
- **Don't** put a colored left/right border stripe on any card, list item, or callout — full borders or background tints only.
- **Don't** add an uppercase tracked "eyebrow" label above section headings — this system's hierarchy comes from the Display/Headline/Body type scale, not a kicker convention.
