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
 * Visual pass only (see DESIGN.md): the draft text is this card's "one lit
 * thing" — read at body typography, capped to a ~70ch measure, everything
 * else (badge, prompt, buttons) recedes around it. "Copy & Mark Posted" is
 * the card's one primary action and stays a full text button; "Copy
 * prompt", "Regenerate", and "Discard" are icon-only ghost buttons (see
 * `.icon-button` in globals.css) — same actions, more compact chrome. The
 * content-safety badge sits at the top of the card, on its own line, so it
 * can't be missed. The pending-version compare is visually separated by
 * `.pending-compare`'s top border and stacked clearly under the current
 * draft so "keep new" vs. "keep original" reads unambiguously.
 *
 * `index` (the post's 1-based position within the run, passed by
 * review/page.tsx) renders as a numbered circle absolutely positioned in
 * the card's top-right corner, above the id-chip/title rows (see
 * `.draft-index-badge` in globals.css — a light tint of the accent color,
 * not the sidebar's dark active-pill fill). Both the title and status-line
 * rows reserve right-side padding so their text never runs under it.
 * `.draft-card` is `position: relative` so the badge anchors to this card.
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
 * PHASE-6 TRANSLATION — language tab switcher (per
 * TRANSLATION--on-demand-translation.md and this phase's
 * review-ui-integration substep):
 *
 * - `activeTab` is `"en"` or a `Language` (`es`/`fr`/`de`/`it` — Portuguese
 *   was dropped, see lib/translation/models.ts's UNAVAILABLE_LANGUAGES, so
 *   there is deliberately no `pt` tab here). Exactly one tab's text is ever
 *   shown at a time — this is a switcher, not a side-by-side compare (that
 *   visual language is reserved for the pending-version regenerate compare
 *   below, which is a different feature).
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
 * - A language tab with no translation yet renders its tab label as
 *   "Translate to {Language}" instead of a blank pane — clicking it both
 *   switches `activeTab` to that language (optimistic — the user is taken
 *   straight to the result) and fires `translatePost` inside the same
 *   `useTransition` + `router.refresh()` pattern Regenerate already uses.
 *   `pendingLanguage` tracks which language is in flight so only that tab
 *   (not every untranslated tab) shows the loading label, and every
 *   untranslated tab is disabled while any translate is in flight, to rule
 *   out firing a second overlapping request for the same or another
 *   language from the same card.
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
 * - The "may be outdated" notice reuses `.tag` (not `.badge` — that fill is
 *   reserved for the content-safety flag's accent treatment per DESIGN.md's
 *   One Lit Thing Rule) and reads directly off the active tab's
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

export function DraftCard({ post, index }: { post: PostWithPending; index: number }) {
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <article className={muted ? "card draft-card muted" : "card draft-card"}>
      <span className="draft-index-badge" aria-hidden="true">
        {index}
      </span>
      {post.title && <p className="draft-title" style={{ paddingRight: "50px" }}>{post.title}</p>}
      <p
        className="status-line"
        style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", flexWrap: "wrap", marginTop: 0, paddingRight: "50px" }}
      >
        <span className="data id-chip">#{post.id}</span>
        <a className="data" href={post.url} target="_blank" rel="noopener noreferrer">
          {post.url}
        </a>
      </p>

      {status && (
        <p role="alert" style={{ marginTop: 0, marginBottom: "var(--space-sm)", fontWeight: 500 }}>
          {status}
        </p>
      )}

      {muted && (
        <span className="tag" style={{ marginBottom: "var(--space-sm)", display: "inline-block" }}>
          {post.discarded ? "Discarded" : "Posted"}
        </span>
      )}

      {flagged && (
        <div style={{ marginBottom: "var(--space-sm)" }}>
          <span className="badge">content-safety flag</span>
        </div>
      )}

      <div className="lang-tabs" role="tablist" aria-label="Language">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "en"}
          className={activeTab === "en" ? "lang-tab lang-tab--active" : "lang-tab"}
          onClick={() => setActiveTab("en")}
        >
          English
        </button>
        {LANGUAGES.map((lang) => {
          const hasTranslation = lang in translationTexts;
          const isPendingThisLang = isTranslating && pendingLanguage === lang;
          return (
            <button
              key={lang}
              type="button"
              role="tab"
              aria-selected={activeTab === lang}
              className={activeTab === lang ? "lang-tab lang-tab--active" : "lang-tab"}
              onClick={() => (hasTranslation ? setActiveTab(lang) : handleTranslate(lang))}
              disabled={!hasTranslation && isTranslating}
            >
              {hasTranslation ? LANGUAGE_LABELS[lang] : isPendingThisLang ? "Translating…" : `Translate to ${LANGUAGE_LABELS[lang]}`}
            </button>
          );
        })}
      </div>

      {activeTranslation?.outdated && (
        <div style={{ marginBottom: "var(--space-sm)" }}>
          <span className="tag">May be outdated — the English text changed since this was translated.</span>
        </div>
      )}

      {activeTab === "en" || activeTab in translationTexts ? (
        <div style={{ maxWidth: "70ch" }}>
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
        <p className="status-line" style={{ maxWidth: "70ch" }}>
          {isTranslating && pendingLanguage === activeTab ? TRANSLATING_LABEL : `Translate to ${LANGUAGE_LABELS[activeTab]}`}
        </p>
      )}

      <div className="image-prompt" style={{ maxWidth: "70ch" }}>
        <span className="image-prompt-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          Image prompt
        </span>
        <p className="image-prompt-text">{post.imagePrompt}</p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "var(--space-sm)",
          marginTop: "var(--space-md)",
        }}
      >
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
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
        </div>
        <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
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
          <span className="tooltip-target">
            <button className="primary" onClick={handleCopyAndPost} disabled={muted} aria-label="Copy & Mark Posted" title="Copy & Mark Posted">
              Copy &amp; Mark Posted
            </button>
            <span className="tooltip-bubble">Copy text, mark as posted</span>
          </span>
        </div>
      </div>

      {post.pendingVersion && (
        <div className="pending-compare">
          <p className="status-line" style={{ marginTop: 0 }}>New version:</p>
          {post.pendingVersion.title && <p className="draft-title">{post.pendingVersion.title}</p>}
          <p style={{ maxWidth: "70ch" }}>{post.pendingVersion.originalText}</p>
          <div style={{ display: "flex", gap: "var(--space-sm)", flexWrap: "wrap" }}>
            <button onClick={() => handleKeep(post.pendingVersion!.id, post.id)}>Keep this one</button>
            <button onClick={() => handleKeep(post.id, post.pendingVersion!.id)}>Keep original</button>
          </div>
        </div>
      )}
    </article>
  );
}
