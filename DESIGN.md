---
name: sift
description: A warm, sand-and-terracotta studio for reviewing AI-drafted LinkedIn posts.
colors:
  bg: "#EDE0C8"
  surface: "#FAF3E5"
  surface-raised: "#F3E7D0"
  surface-sunken: "#FDF8EE"
  chip-bg: "#EFE0C4"
  chip-bg-strong: "#E8CFA9"
  border: "#E5D2AF"
  border-dashed: "#D8BC8E"
  ink: "#43301F"
  ink-soft: "#6E4E28"
  muted: "#8A7256"
  muted-soft: "#A08A66"
  label: "#A0713C"
  primary: "#C0532B"
  primary-deep: "#A8431F"
  primary-text: "#FBF2E4"
  success: "#5A7D46"
  success-deep: "#4A6A38"
  danger: "#A6503B"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 3vw, 2.5rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
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
  sm: "14px"
  md: "18px"
  lg: "24px"
  xl: "28px"
  pill: "999px"
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
    rounded: "{rounded.md}"
    padding: "16px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.md}"
    padding: "16px 18px"
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
    padding: "16px 24px"
  input:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  badge-accent:
    backgroundColor: "{colors.chip-bg-strong}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
---

# Design System: sift

## 1. Overview

**Creative North Star: "Organic"**

A warm studio desk in daylight — sand walls, cream paper, one terracotta accent that shows up
everywhere the product wants your attention. This replaces the previous "Study Lamp" system (a
near-black, one-lit-thing reading room) after the self-hoster reviewing this tool asked for
something warmer, rounder, and more approachable — a family-friendly workspace rather than a
quiet, restrained one. The job hasn't changed (read a handful of drafted posts, glance at what
they cost, send them or let them go), but the room around that job is now bright and tactile
instead of dim and minimal.

Warmth here is structural, not an accent choice: the background itself is sand, every content
block earns a soft cream card, and one terracotta hue carries navigation, primary actions, and
the small chip/badge language throughout. A rounded, friendly display face (Bricolage Grotesque)
pairs with a plain, highly legible body sans (Instrument Sans) so headings feel personable while
long-form draft text stays easy to read. IBM Plex Mono remains the system's one functional
exception, unchanged from the previous system, for anything tabular or numeric.

**Key Characteristics:**
- Sand background, cream card surfaces — warmth lives in the room itself, not just accents.
- One terracotta hue used liberally: navigation, primary actions, chips, badges — the system's
  signature color, not a rationed one.
- Cards are the default content container — sections, rows, and list items all earn a soft,
  rounded surface, not just Review's draft posts.
- Heavy, consistent rounding (14–28px, plus true pills for chips/badges/toggles) — playful,
  never sharp.
- A persistent left sidebar, not a top bar — navigation, Run Now, and at-a-glance status all
  live in one place regardless of which page is open.

## 2. Colors

Sand and cream carry every surface; one terracotta hue is the system's whole "color" vocabulary
for interaction — there is no separate structural-vs-personal split as under the previous system.

### Primary
- **Terracotta** (`#C0532B`): navigation active state, primary buttons ("Run Now", "Save",
  "Approve"), id chips, badges, the sidebar's brand mark. Used freely across a screen — this is
  the system's signature color, not a restricted one. Deeper variant **Terracotta Deep**
  (`#A8431F`) is the hover/active state.

### Neutral
- **Sand** (`#EDE0C8`, `bg`): the base background — warm by design, not a compromise.
- **Cream** (`#FAF3E5`, `surface`): the default card surface, one step lighter than the
  background. Nearly every content block sits on this tone.
- **Warm Sand** (`#F3E7D0`, `surface-raised`): a second, slightly deeper cream — the sidebar's
  running-stage chip, the image-prompt block, secondary surfaces sitting on top of a card.
- **Pale Cream** (`#FDF8EE`, `surface-sunken`): input backgrounds — one step lighter than
  `surface`, so a field reads as a "well" inside its card.
- **Sand Chip** / **Sand Chip Strong** (`#EFE0C4` / `#E8CFA9`, `chip-bg` / `chip-bg-strong`):
  neutral chip fills — toggle tracks, secondary buttons, id chips, provider "kind" tags.
- **Border** / **Border Dashed** (`#E5D2AF` / `#D8BC8E`): line-drawing colors — plain dividers,
  and the image-prompt block's dashed outline specifically.
- **Ink** / **Ink Soft** (`#43301F` / `#6E4E28`): body text and chip/data text respectively — both
  genuinely warm browns, never cold gray.
- **Muted** / **Muted Soft** (`#8A7256` / `#A08A66`): secondary/meta text — timestamps, helper
  copy, tooltip labels.
- **Label** (`#A0713C`): the one uppercase-tracked color, reserved for table column headers
  (Admin) — see the reversed eyebrow rule below.

### Named Rules
**The Warm Surface Rule (reversed from "No Warm Surface").** Warmth lives in the background
itself, not just ink and accent. `bg` is deliberately sand, not zero-chroma — the previous
system's objection to a "cream/sand AI cliché" no longer applies once the whole point is a warm,
approachable studio rather than a quiet reading room.

**The Warm Consistency Rule (replaces "One Lit Thing").** Terracotta is the system's one
interactive color and is used consistently wherever an element needs to signal "this is
active/actionable" — the active nav pill, every primary button, every id chip and badge. There is
no per-screen budget on it; consistency, not restraint, is the goal now.

## 3. Typography

**Display Font:** Bricolage Grotesque (with system-ui, sans-serif fallback) — headings, the
sidebar brand mark, big data figures (Costs' spend number, Settings' retention-days figure).
**Body/UI Font:** Instrument Sans (with system-ui, sans-serif fallback) — everything else: draft
text, form labels, nav items, buttons.
**Data Font:** IBM Plex Mono (with ui-monospace fallback) — unchanged from the previous system:
costs, dates, run IDs, model names, API keys.

### Hierarchy
- **Display** (700, `clamp(1.75rem, 3vw, 2.5rem)`, 1.15): page titles, and any large standalone
  figure (spend total, retention day count).
- **Headline** (600, 1.25rem, 1.3): section headings within a page.
- **Body** (400, 1rem, 1.6): draft text, form labels, all reading content.
- **Label** (500, 0.8125rem, 1.4, +0.01em): field labels, button text, nav items — Instrument
  Sans, same as Body, just smaller and heavier.
- **Data** (400, 0.875rem, mono): cost figures, timestamps, run IDs — anywhere a column of
  numbers needs to align.

### Named Rules
**The Two-Voice Rule (replaces "One Voice").** Exactly two sans-serif voices, each with one job:
Bricolage Grotesque for structure and hierarchy (headings, big figures), Instrument Sans for
everything you read or interact with (body text, labels, buttons, nav). A third sans-serif
appearing anywhere is drift; so is Bricolage Grotesque showing up in body copy or Instrument Sans
in a page title.

## 4. Elevation

Still flat by default — a card is distinguished from `bg` by its `surface` tone and radius, not a
shadow, and this holds unchanged from the previous system. The one deliberate, narrow addition is
the sidebar's Run Now button, which earns a soft colored shadow (`--shadow-cta`) as a hierarchy
signal even though it sits in normal document flow rather than floating above it — matching the
approved external mockup exactly. Toasts keep the previous system's one floating-shadow use.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35)`): toasts, dropdown menus, anything
  rendered via `position: fixed` above the page's own stacking context.
- **CTA** (`box-shadow: 0 6px 16px rgba(160, 63, 30, 0.28)`): the sidebar's Run Now button only —
  the single named exception to "shadows only on floating elements."

### Named Rules
**The Flat-By-Default Rule (mostly preserved).** A card sits at rest with zero shadow,
distinguished from `bg` only by its `surface` tone. The CTA shadow above is the one named,
deliberate exception — it does not license shadows on ordinary cards or list rows.

## 5. Components

### Buttons
- **Shape:** heavily rounded (14px, `{rounded.sm}`) for ordinary buttons; the sidebar's Run Now
  button uses `{rounded.md}` (18px) to match its larger size.
- **Primary:** Terracotta fill, warm near-white text (`primary-text`), used for the one action
  that matters most on a view ("Run Now," "Approve," "Save").
- **Ghost (default secondary):** transparent background, `ink` text — Edit, Regenerate, Cancel,
  and every action that isn't the one primary action.
- **Danger (ghost variant):** transparent background, `danger` text — reserved for "Discard,"
  never filled, unchanged from the previous system's reasoning (a filled red button reads as an
  alarm this product doesn't need to sound).
- **Toggle switches:** provider/source enable toggles and the sidebar's spinner both use the
  terracotta/success color pair against a `chip-bg` track.

### Cards
**The Cards-Are-Default Rule (reversed from "Card-Is-Not-Default").** Every section, every list
row that's genuinely a discrete unit (a provider, a draft post), and every admin table all sit on
a `surface` card now. The narrow exceptions that stay un-carded: in-progress add/edit mini-forms
(the "+ Add provider"/"+ Add source" affordances and their expanded field rows), and the sidebar
nav items themselves (pills, not cards).
- **Corner Style:** 18px (`{rounded.md}`) for ordinary content cards; 24–28px for the sidebar
  shell and admin table wrapper.
- **Background:** `surface`, one tone lighter than `bg`.
- **Internal Padding:** 16px–24px depending on content density (a table-wrapping card uses
  tighter padding than a prose section — see `.card--table`).

### Inputs / Fields
- **Style:** `surface-sunken` background (one shade lighter than the card it sits in, so it
  reads as a "well"), 1px `border`, 14px radius, `ink` text.
- **Focus:** border shifts to `primary`, plus a soft `primary-glow` ring — no layout shift.

### Navigation
- **Style:** a persistent left sidebar, not a top bar. Brand mark, Run Now, nav items with a
  filled-pill active state (`ink` background, `primary-text`), and a footer stat strip (last run
  finished, drafts awaiting review).
- **Admin's sub-nav** is styled as horizontal pill tabs (`.admin-tabs`) matching this same
  filled-pill active-state language, while remaining real routes under the hood — a visual
  match, not a structural one.

### Badges & Chips
- **Style:** true pills (`{rounded.pill}`), `chip-bg-strong` fill with `ink-soft` text — the id
  chip on a draft post, the "new/unreviewed" nav badge, the discarded/posted status tag.
- **Admin table headers** are the one place uppercase-tracked labels appear (`label` color,
  small-caps-style letter-spacing) — a deliberate, narrow reversal of the previous system's
  no-eyebrow rule, scoped to table column headers only.

## 6. Do's and Don'ts

### Do:
- **Do** keep `bg` warm and sand-toned — the background carrying warmth is the point now, not
  something to avoid.
- **Do** wrap genuinely discrete content (a provider, a draft, a table row) in a card by default.
- **Do** use terracotta consistently for every active/primary signal — nav, buttons, chips.
- **Do** cap draft/body text at a comfortable reading measure — this is still a tool for reading
  full post drafts.
- **Do** respect `prefers-reduced-motion`: every hover/transition needs an instant-swap fallback.

### Don't:
- **Don't** introduce a shadow on an ordinary at-rest card — the CTA button is the one named
  exception, not a precedent for general use.
- **Don't** use a filled red button for Discard — ghost + `danger` text only.
- **Don't** add a gradient anywhere, or glassmorphism/backdrop-blur.
- **Don't** introduce a third sans-serif alongside Bricolage Grotesque and Instrument Sans.
- **Don't** use the uppercase-tracked label style anywhere outside Admin's table headers — it's a
  narrow, scoped exception, not a general heading treatment.
