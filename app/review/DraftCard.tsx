/**
 * Interactive review card for a single drafted post (`/review`).
 *
 * Client Component: edits autosave on textarea blur via the `saveEdit`
 * Server Action, "Discard" calls `discardPost`, and "Copy & Mark Posted"
 * copies the current draft text to the clipboard and only calls the
 * `markPosted` Server Action if that clipboard write succeeds.
 *
 * This ordering is deliberate — `navigator.clipboard.writeText` is a
 * browser-only API and cannot run inside a Server Action, so the clipboard
 * write must happen here, client-side, before markPosted is ever called.
 * If the write fails, we surface an error and do NOT mark the post as
 * posted, since doing so would mislead the user into thinking they'd
 * copied and posted text that never actually made it to their clipboard.
 *
 * `muted` (derived from `post.posted`/`post.discarded`) is only as fresh as
 * the Server Component props from the last page load — the authoritative
 * mutual-exclusion guard against an invalid discarded+posted combination
 * lives server-side in discardPost/markPosted (see actions.ts). To keep the
 * UI from looking stale after a successful discard or mark-posted (which
 * would otherwise leave both buttons enabled until a manual reload), both
 * handlers call `router.refresh()` on success so the page re-fetches fresh
 * post state and the card re-renders muted immediately.
 *
 * Regenerate (Task 6) reuses this same "mutate then router.refresh()"
 * pattern via `useTransition` so the button can show a "Regenerating…"
 * label while the Server Action is in flight. It is disabled while muted,
 * while a regenerate for this card is already pending, or while this card
 * already has a `pendingVersion` awaiting resolution — this card's own
 * pending compare must be resolved (via "Keep this one"/"Keep original",
 * which call `keepVersion`) before another regenerate can be triggered for
 * it. Other cards remain fully interactive in the meantime: the run-guard
 * lock in `regeneratePost` only prevents two regenerate/pipeline runs from
 * overlapping, it doesn't block edits/discard/copy on other cards.
 *
 * LAYOUT — one column, three bands (see app/PostCard.tsx, shared with
 * /posted): a head carrying the `#id` chip, the source URL and the
 * language badge; a body carrying the title and the draft text; a footer
 * carrying the actions. Two hairlines separate them.
 *
 * The bands replace an undivided card where the id chip, the title, the
 * draft text and the action row all sat at the same level with only
 * margins between them — nothing marked where the metadata stopped and
 * the writing began. The language badge used to float absolutely in the
 * top-right corner, which is why both the title and the status line
 * carried a hardcoded `paddingRight: "66px"` reserving its footprint; in
 * the head band it is simply the last item in a flex row, so those two
 * magic numbers are gone. The corner itself was inherited from a numbered
 * index badge (`index`, once passed by review/page.tsx), dropped earlier.
 *
 * A two-column variant with the metadata and actions in a left rail was
 * tried and rejected: it put the actions far from the text they act on
 * and left the rail mostly empty beside a short draft. See PostCard.tsx.
 *
 * "Copy & Mark Posted" is the card's one primary action and stays a full
 * text button, alone on the right of the footer; "Copy prompt",
 * "Regenerate" and "Discard" are icon-only ghost buttons (see
 * `.icon-button` in globals.css) grouped on the left — same actions, same
 * order, more compact chrome. The content-safety badge sits above the
 * draft text, on its own line, so it can't be missed. The pending-version
 * compare stays visually separated by `.pending-compare`'s top border and
 * stacked under the current draft, so "keep new" vs. "keep original" reads
 * unambiguously.
 *
 * The image prompt is folded behind a `Disclosure` rather than sitting
 * open under every draft. It is a prompt for a photo you generate
 * elsewhere — needed once per post, at the end, and never while reading.
 * The text and its dashed block are unchanged; only its default state is.
 *
 * The draft textarea auto-grows to its content's `scrollHeight` (see the
 * `resizeTextarea` effect below) instead of sitting at a fixed height with
 * an inner scrollbar — a typical post-length draft is this tool's single
 * most important reading surface, so it should read in full at a glance.
 * The image prompt below it is wrapped in `.image-prompt` with an explicit
 * icon + label, since an unlabeled italic line was easy to mistake for a
 * caption or secondary draft text rather than what it actually is: the
 * prompt for the post's AI-generated photo. None of this touches the
 * handlers, state, props, or the conditions that gate them below.
 *
 * PHASE-6 TRANSLATION — language dropdown (per
 * TRANSLATION--on-demand-translation.md and this phase's
 * review-ui-integration substep; re-skinned from an earlier always-visible
 * tab row into a compact dropdown per follow-up user feedback — only the
 * chrome changed, the state/action logic below is untouched):
 *
 * - `activeTab` is `"en"` or a `Language` (`es`/`fr`/`de`/`it` — Portuguese
 *   was dropped, see lib/translation/models.ts's UNAVAILABLE_LANGUAGES, so
 *   there is deliberately no `pt` option here). Exactly one language's text
 *   is ever shown at a time — this is a switcher, not a side-by-side
 *   compare (that visual language is reserved for the pending-version
 *   regenerate compare below, which is a different feature).
 *
 * - Flags are hand-drawn inline SVG (`FlagIcon` below), not emoji. Emoji
 *   flags (🇬🇧🇪🇸🇫🇷🇩🇪🇮🇹) were the original choice, but on Windows they
 *   don't render as flags at all — Windows' bundled emoji font has no
 *   regional-indicator flag glyphs, so a flag emoji falls back to its
 *   two-letter ISO code rendered as plain text ("GB", "IT"...). That's a
 *   platform/font limitation with no CSS-level fix, and this app is meant
 *   to run fully offline/self-hosted, so pulling in an icon library or
 *   loading flag images from a CDN was never on the table either. Each flag
 *   is instead a few `<rect>`/`<path>` shapes on a `viewBox="0 0 24 24"`,
 *   sized via a `size` prop so the same markup works both in the ~20-24px
 *   circular trigger badge and the panel's larger option rows.
 *
 * - The switcher itself is a `.lang-dropdown`: a trigger `<button>` showing
 *   only the active language's flag (the caret from the original pill
 *   trigger is still in the DOM for a11y/structure but visually hidden at
 *   this size — see `.lang-dropdown-trigger--badge` in globals.css), and a
 *   `.lang-dropdown-panel` that opens on click, listing all five languages
 *   as flag + name. `isLangMenuOpen` (plain `useState`, same pattern as
 *   every other piece of local state here) tracks whether the panel is
 *   open; the trigger reflects it via `aria-expanded`. The panel closes on:
 *   picking any option, pressing Escape, or a mousedown outside
 *   `.lang-dropdown` (see the `isLangMenuOpen` effect below — its
 *   document-level listeners are only attached while the panel is actually
 *   open, so a page full of draft cards isn't paying for global listeners
 *   on every closed dropdown). Panel options are plain `<button>` elements
 *   — native tab order and Enter/Space activation are enough for this
 *   internal tool's v1, so there's no roving-tabindex/full ARIA-menu
 *   implementation here.
 *
 * - The trigger is a circular badge (`.lang-dropdown-trigger--badge` in
 *   globals.css), 42px, holding a flag. It sits at the right end of the
 *   card's head band. It used to be absolutely positioned in the card's
 *   top-right corner via a `.lang-dropdown--corner` modifier, which
 *   existed only to flip the panel's anchor so it opened toward the
 *   card's interior rather than off its right edge. It still needs that,
 *   so the modifier survives — but as one line on the panel rather than a
 *   whole positioned variant.
 *
 * - The flag itself fills the entire circle edge-to-edge (per follow-up
 *   feedback: "the whole circle should be the flag, not a squared flag
 *   inside it") rather than sitting as a small icon with the badge's
 *   gradient background showing around it. `FlagIcon`'s `size` is 44 here
 *   (bigger than the 42px circle) specifically so the square SVG fully
 *   bleeds past every edge of the circle before `.lang-dropdown-trigger
 *   --badge`'s `overflow: hidden` clips it — each flag's `<rect>`/`<path>`
 *   shapes already cover their full `0 0 24 24` viewBox with no internal
 *   padding, so scaling up and clipping to a circle doesn't reveal any
 *   background at the edges. The panel's flags (next to each language's
 *   name) stay at the smaller default size — this only applies to the
 *   corner trigger, where "be the whole circle" was the actual ask.
 *
 * - The single flat `text` state this component used to have is now split
 *   two ways: `englishText` (was `text`, same role) and `translationTexts`
 *   (a `Partial<Record<Language, string>>` keyed by language). This is the
 *   minimal restructuring that satisfies "switching tabs shows the right
 *   text, editing one tab doesn't clobber another" without reaching for a
 *   state library — plain `useState`, same as the rest of this file.
 *   `activeText` (the single source of truth for what the textarea shows,
 *   what gets copied, and what the content-safety linter checks) is derived
 *   from whichever of the two the active tab points at.
 *
 * - The textarea itself is `key={activeTab}` so it remounts on tab switch —
 *   it still uses the file's existing `defaultValue` + `onChange` pattern
 *   (an uncontrolled field kept in sync via onChange), and that pattern
 *   only re-reads `defaultValue` on mount. Without the `key`, switching tabs
 *   would change React state but leave the previous tab's text sitting in
 *   the DOM node, since a `defaultValue` prop change is a no-op once a
 *   textarea is mounted.
 *
 * - A dropdown option for a language with no translation yet still reads as
 *   its plain flag + name (same as a translated option) but carries a
 *   small "Translate" tag on the right, so picking it clearly starts a
 *   translation rather than switching to an empty view — same behavior as
 *   the old "Translate to {Language}" tab label, just re-skinned. Selecting
 *   it closes the panel, switches `activeTab` to that language (optimistic
 *   — the user is taken straight to the result) and fires `translatePost`
 *   inside the same `useTransition` + `router.refresh()` pattern Regenerate
 *   already uses. `pendingLanguage` tracks which language is in flight so
 *   only that option's tag flips to "Translating…" (not every untranslated
 *   option), and every untranslated option is disabled while any translate
 *   is in flight, to rule out firing a second overlapping request for the
 *   same or another language from the same card.
 *
 * - The loading label is a single honest string —
 *   "Translating (first use may take longer — downloading model)…" —
 *   rather than a fake two-phase "downloading / translating" progress
 *   indicator. `translatePost`'s `ActionResult` (lib/translation/actions.ts)
 *   is a plain `{ ok, error? }` resolve/reject with no phase information in
 *   between, and the worker_thread pipeline behind it (lib/translation/
 *   translate.ts) doesn't surface progress events either — inventing a
 *   client-side phase guess (e.g. a timer-based "assume downloading for the
 *   first N seconds") would be UI fiction with nothing backing it.
 *
 * - On a failed translate, nothing was written server-side (see
 *   lib/translation/actions.ts's header) — the UI mirrors that by resetting
 *   `activeTab` back to `"en"` and surfacing the failure in the existing
 *   `status` line, so the user is never left looking at a blank or broken
 *   translated tab.
 *
 * - `translationTexts` is seeded once from `post.translations` (the prop
 *   from getPostsForRun, see lib/review/queries.ts) and then kept in sync
 *   by a small effect that only *adds* languages missing from local state —
 *   it never overwrites a language already tracked locally. This is what
 *   lets a freshly-completed translate (which arrives back as a new
 *   `post.translations` row after `router.refresh()`) show up without a
 *   remount, while never clobbering an in-progress local edit on some other
 *   tab the same effect run also happens to see.
 *
 * - Editing a translated tab reuses the exact `handleBlur`-autosaves
 *   pattern the English tab already used, calling `saveTranslationEdit`
 *   instead of `saveEdit`. It deliberately does NOT touch the `outdated`
 *   flag — see lib/translation/actions.ts's header for why a human editing
 *   a translation doesn't make it stale.
 *
 * - The "may be outdated" notice reuses `.tag`, not `.badge`. Terracotta
 *   means "act on this" (DESIGN.md's Warm Consistency Rule) and this
 *   notice is informational, so it stays neutral. It reads off the active tab's
 *   `TranslationRow.outdated` column. This is informational only: per the
 *   locked "mark stale, don't auto-retranslate" decision, nothing here
 *   triggers a fresh translate just because the flag is set.
 *
 * - Copy & Mark Posted, the content-safety flag, and the auto-grow textarea
 *   effect all now read `activeText` instead of the old flat `text` — so
 *   whichever tab is active is what gets copied, checked, and displayed.
 *   `markPosted` itself is unchanged: there is no per-language posted
 *   state, marking posted from any tab marks the underlying post.
 */
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveEdit,
  discardPost,
  markPosted,
  regeneratePost,
  keepVersion,
  translatePost,
  saveTranslationEdit,
} from "./actions";
import { isFlagged } from "../../lib/safety/leakage-linter";
import { PostCard } from "../PostCard";
import { Disclosure } from "../Disclosure";
import { StatusMessage } from "../StatusMessage";
import type { PostWithPending } from "../../lib/review/queries";
import type { Language } from "../../lib/translation/models";

// `Language` (lib/translation/models.ts) still includes "pt" in its type —
// the DB enum keeps it for schema-compat reasons — but UNAVAILABLE_LANGUAGES
// marks it as not actually wired up (see that file's header), and this
// phase's spec is explicit: no `pt` tab. `SupportedLanguage` is this
// component's own narrower type for "a language this tab switcher actually
// offers," so LANGUAGES/LANGUAGE_LABELS can't silently drift out of sync
// with what's really available.
type SupportedLanguage = Exclude<Language, "pt">;
type TabKey = "en" | SupportedLanguage;

const LANGUAGES: SupportedLanguage[] = ["es", "fr", "de", "it"];
const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
};
const TRANSLATING_LABEL =
  "Translating (first use may take longer — downloading model)…";

// Hand-drawn inline SVG flags, one per `TabKey` — see this file's header
// for why these are shapes instead of flag emoji. Each flag is built the
// same way: an opaque base `<rect>` covering the full 24x24 viewBox, then
// one or two narrower `<rect>`s drawn on top so the bands/stripes stack up
// in the right order and proportions (e.g. Spain's middle yellow band is
// drawn 12/24 tall — half the flag — to read as "thicker" than the two red
// bands it splits). `size` defaults to a value that reads fine inside a
// panel option row; the corner trigger badge passes a smaller size.
function FlagIcon({ language, size = 20 }: { language: TabKey; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  switch (language) {
    case "es":
      // Spain: red / yellow (thicker middle) / red, stacked horizontally.
      return (
        <svg {...common}>
          <rect width="24" height="24" fill="#AA151B" />
          <rect y="6" width="24" height="12" fill="#F1BF00" />
        </svg>
      );
    case "fr":
      // France: blue / white / red, stacked vertically left to right.
      return (
        <svg {...common}>
          <rect width="24" height="24" fill="#ED2939" />
          <rect width="16" height="24" fill="#FFFFFF" />
          <rect width="8" height="24" fill="#002395" />
        </svg>
      );
    case "de":
      // Germany: black / red / gold, stacked horizontally top to bottom.
      return (
        <svg {...common}>
          <rect width="24" height="24" fill="#FFCE00" />
          <rect width="24" height="16" fill="#DD0000" />
          <rect width="24" height="8" fill="#000000" />
        </svg>
      );
    case "it":
      // Italy: green / white / red, stacked vertically left to right.
      return (
        <svg {...common}>
          <rect width="24" height="24" fill="#CE2B37" />
          <rect width="16" height="24" fill="#FFFFFF" />
          <rect width="8" height="24" fill="#009246" />
        </svg>
      );
    case "en":
    default:
      // UK/English: a simplified Union Jack — navy field, a white diagonal
      // cross, a red diagonal cross, a white cross, a red cross, each pair
      // drawn thick-then-thin so the thinner color reads as sitting on top
      // of the thicker one. Not pixel-accurate (the real flag's diagonals
      // are off-center and unevenly clipped), but recognizable at ~20px.
      return (
        <svg {...common}>
          <rect width="24" height="24" fill="#00247D" />
          <path d="M0 0 L24 24 M24 0 L0 24" stroke="#FFFFFF" strokeWidth="4.5" />
          <path d="M0 0 L24 24 M24 0 L0 24" stroke="#CF142B" strokeWidth="2.2" />
          <path d="M12 0 V24 M0 12 H24" stroke="#FFFFFF" strokeWidth="7.5" />
          <path d="M12 0 V24 M0 12 H24" stroke="#CF142B" strokeWidth="4.5" />
        </svg>
      );
  }
}

export function DraftCard({ post }: { post: PostWithPending }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabKey>("en");
  const [englishText, setEnglishText] = useState(post.editedText ?? post.originalText);
  const [translationTexts, setTranslationTexts] = useState<Partial<Record<Language, string>>>(() => {
    const initial: Partial<Record<Language, string>> = {};
    for (const t of post.translations) initial[t.language as Language] = t.translatedText;
    return initial;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [isRegenerating, startTransition] = useTransition();
  const [isTranslating, startTranslateTransition] = useTransition();
  const [pendingLanguage, setPendingLanguage] = useState<SupportedLanguage | null>(null);
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  const activeText = activeTab === "en" ? englishText : translationTexts[activeTab] ?? "";
  const activeTranslation = activeTab !== "en" ? post.translations.find((t) => t.language === activeTab) : undefined;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [activeText]);

  // next/font loads Figtree with `display: "swap"` — the fallback system
  // font renders first, so the height computed on mount can be too short
  // once Figtree swaps in and reflows the text (different metrics can wrap
  // it onto more lines). Re-measure once fonts finish loading; harmless if
  // they were already ready by then. Without this, `overflow: hidden` on
  // `.draft-textarea` silently clips the bottom of the draft instead of
  // scrolling, which is worse than the original fixed-height textarea.
  useEffect(() => {
    const resize = () => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready.then(resize);
    }
    // A window resize can also change how many lines the text wraps to at
    // the card's fixed max-width, so the frozen height needs recomputing.
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Adds newly-arrived translations (e.g. a translate that just completed
  // and came back through router.refresh()) into local state without ever
  // overwriting a language this component is already tracking — that's
  // what keeps an in-progress edit on one tab safe from being clobbered by
  // this same sync running after some other tab's translate resolves.
  useEffect(() => {
    setTranslationTexts((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const t of post.translations) {
        const lang = t.language as Language;
        if (!(lang in next)) {
          next[lang] = t.translatedText;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [post.translations]);

  // Standard dropdown dismissal for `.lang-dropdown`: closes the panel on
  // Escape or on a mousedown outside it. Listeners are only attached while
  // `isLangMenuOpen` is true, so a page of many draft cards isn't carrying
  // global document listeners for every card's closed dropdown at once.
  useEffect(() => {
    if (!isLangMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setIsLangMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsLangMenuOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLangMenuOpen]);

  const handleTextChange = (value: string) => {
    if (activeTab === "en") {
      setEnglishText(value);
    } else {
      const lang = activeTab;
      setTranslationTexts((prev) => ({ ...prev, [lang]: value }));
    }
  };

  const handleActiveBlur = async () => {
    if (activeTab === "en") {
      const result = await saveEdit(post.id, englishText);
      if (!result.ok) setStatus(`Save failed: ${result.error}`);
    } else {
      const lang = activeTab;
      const result = await saveTranslationEdit(post.id, lang, translationTexts[lang] ?? "");
      if (!result.ok) setStatus(`Save failed: ${result.error}`);
    }
  };

  const handleDiscard = async () => {
    const result = await discardPost(post.id);
    if (!result.ok) {
      setStatus(`Discard failed: ${result.error}`);
      return;
    }
    setStatus("Discarded.");
    router.refresh();
  };

  const handleCopyAndPost = async () => {
    try {
      await navigator.clipboard.writeText(activeText);
    } catch {
      setStatus("Clipboard write failed — not marked as posted.");
      return;
    }
    const result = await markPosted(post.id);
    if (!result.ok) {
      setStatus(`Copied, but marking posted failed: ${result.error}`);
      return;
    }
    setStatus("Copied and marked posted.");
    router.refresh();
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(post.imagePrompt);
    } catch {
      setStatus("Copy prompt failed.");
    }
  };

  const handleRegenerate = () => {
    startTransition(async () => {
      const result = await regeneratePost(post.id);
      if (!result.ok) {
        setStatus(`Regenerate failed: ${result.error}`);
        return;
      }
      router.refresh();
    });
  };

  const handleKeep = (keptId: number, deletedId: number) => {
    startTransition(async () => {
      const result = await keepVersion(keptId, deletedId);
      if (!result.ok) {
        setStatus(`Could not resolve regenerate: ${result.error}`);
        return;
      }
      router.refresh();
    });
  };

  const handleTranslate = (language: SupportedLanguage) => {
    setStatus(null);
    setActiveTab(language);
    setPendingLanguage(language);
    startTranslateTransition(async () => {
      const result = await translatePost(post.id, language);
      if (!result.ok) {
        setStatus(`Translate failed: ${result.error}`);
        setActiveTab("en");
        setPendingLanguage(null);
        return;
      }
      setPendingLanguage(null);
      router.refresh();
    });
  };

  const muted = post.posted || post.discarded;
  const flagged = isFlagged(activeText);

  const head = (
    <>
      <span className="data id-chip">#{post.id}</span>
      <a className="data post-card-source" href={post.url} target="_blank" rel="noopener noreferrer">
        {post.url}
      </a>

      <div className="lang-dropdown lang-dropdown--end" ref={langMenuRef}>
        <button
          type="button"
          className="lang-dropdown-trigger lang-dropdown-trigger--badge"
          aria-expanded={isLangMenuOpen}
          aria-label={`Language: ${activeTab === "en" ? "English" : LANGUAGE_LABELS[activeTab]}. Click to change language.`}
          onClick={() => setIsLangMenuOpen((open) => !open)}
        >
          <FlagIcon language={activeTab} size={44} />
          <svg
            className="lang-dropdown-caret"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isLangMenuOpen && (
          <div className="lang-dropdown-panel">
            <button
              type="button"
              className={activeTab === "en" ? "lang-dropdown-option lang-dropdown-option--active" : "lang-dropdown-option"}
              onClick={() => {
                setIsLangMenuOpen(false);
                setActiveTab("en");
              }}
            >
              <FlagIcon language="en" />
              English
            </button>
            {LANGUAGES.map((lang) => {
              const hasTranslation = lang in translationTexts;
              const isPendingThisLang = isTranslating && pendingLanguage === lang;
              return (
                <button
                  key={lang}
                  type="button"
                  className={activeTab === lang ? "lang-dropdown-option lang-dropdown-option--active" : "lang-dropdown-option"}
                  onClick={() => {
                    setIsLangMenuOpen(false);
                    if (hasTranslation) {
                      setActiveTab(lang);
                    } else {
                      handleTranslate(lang);
                    }
                  }}
                  disabled={!hasTranslation && isTranslating}
                >
                  <FlagIcon language={lang} />
                  {LANGUAGE_LABELS[lang]}
                  {!hasTranslation && (
                    <span className="lang-dropdown-translate-tag">
                      {isPendingThisLang ? "Translating…" : "Translate"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </>
  );

  const footer = (
    <>
      {/* Secondary actions grouped left, the one primary action alone on
          the right — the footer's whole job is to make that split legible. */}
      <div className="inline-row">
        <span className="tooltip-target">
          <button className="icon-button" onClick={handleCopyPrompt} aria-label="Copy image prompt" title="Copy image prompt">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
          <span className="tooltip-bubble">Copy image prompt</span>
        </span>
        <span className="tooltip-target">
          <button
            className="icon-button"
            onClick={handleRegenerate}
            disabled={muted || isRegenerating || !!post.pendingVersion}
            aria-label={isRegenerating ? "Regenerating…" : "Regenerate"}
            title={isRegenerating ? "Regenerating…" : "Regenerate"}
          >
            <svg
              className={isRegenerating ? "spin-icon" : undefined}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <span className="tooltip-bubble">{isRegenerating ? "Regenerating…" : "Regenerate"}</span>
        </span>
        <span className="tooltip-target">
          <button className="icon-button icon-button--danger" onClick={handleDiscard} disabled={muted} aria-label="Discard" title="Discard">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
          <span className="tooltip-bubble">Discard</span>
        </span>
      </div>

      <span className="tooltip-target">
        <button className="primary" onClick={handleCopyAndPost} disabled={muted} title="Copy text, mark as posted">
          Copy &amp; Mark Posted
        </button>
        <span className="tooltip-bubble">Copy text, mark as posted</span>
      </span>
    </>
  );

  return (
    <PostCard head={head} footer={footer} muted={muted}>
      {post.title && <h2 className="draft-title">{post.title}</h2>}

      <StatusMessage message={status} />

      {muted && (
        <p className="post-card-flags">
          <span className="tag">{post.discarded ? "Discarded" : "Posted"}</span>
        </p>
      )}

      {flagged && (
        <p className="post-card-flags">
          <span className="badge">content-safety flag</span>
        </p>
      )}

      {activeTranslation?.outdated && (
        <p className="post-card-flags">
          <span className="tag">May be outdated — the English text changed since this was translated.</span>
        </p>
      )}

      {activeTab === "en" || activeTab in translationTexts ? (
        <div className="measure">
          <textarea
            key={activeTab}
            ref={textareaRef}
            className="draft-textarea"
            defaultValue={activeText}
            onChange={(e) => handleTextChange(e.target.value)}
            onBlur={handleActiveBlur}
          />
        </div>
      ) : (
        <p className="status-line measure">
          {isTranslating && pendingLanguage === activeTab ? TRANSLATING_LABEL : `Translate to ${LANGUAGE_LABELS[activeTab]}`}
        </p>
      )}

      <div className="measure">
        <Disclosure label="Image prompt">
          <div className="image-prompt">
            <p className="image-prompt-text">{post.imagePrompt}</p>
          </div>
        </Disclosure>
      </div>

      {post.pendingVersion && (
        <div className="pending-compare">
          <p className="status-line" style={{ marginTop: 0 }}>New version:</p>
          {post.pendingVersion.title && <p className="draft-title">{post.pendingVersion.title}</p>}
          <p className="measure">{post.pendingVersion.originalText}</p>
          <div className="inline-row">
            <button onClick={() => handleKeep(post.pendingVersion!.id, post.id)}>Keep this one</button>
            <button onClick={() => handleKeep(post.id, post.pendingVersion!.id)}>Keep original</button>
          </div>
        </div>
      )}
    </PostCard>
  );
}
