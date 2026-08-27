/**
 * Interactive form for the Settings page (`/config/settings`).
 *
 * Six panels: Sources, Schedule, Retention, Curation, Model checking,
 * Voice profile. Schedule and Retention sit side by side because they are
 * both small and both about *when* things happen; the rest run full width.
 *
 * Client Component following the same interaction pattern as
 * `app/config/api/ApiConfigForm.tsx`: local `useState` for in-progress
 * input, `useRouter().refresh()` after a successful mutation so the Server
 * Component re-fetches fresh `sources`/`settings` props, and a
 * `<StatusMessage>` per panel for both success and failure.
 *
 * Statuses carry their tone rather than having it guessed from their own
 * wording. This file used to test each message against /failed/i to decide
 * whether to tint it red — a heuristic that rediscovers, from a string,
 * something the handler that built the string already knew.
 *
 * Sources render directly from the `sources` prop (not copied into local
 * state) so a `router.refresh()` after toggle/add immediately reflects the
 * new list; only the add-source form is local state, since that is
 * user-in-progress input. There is deliberately no delete-source action —
 * disabling via the toggle is the only way to take a source out of use.
 *
 * Retention day-counts and curation's posts-per-run render as range
 * sliders (`.range-field`) with a live numeric readout instead of plain
 * number inputs — both are inherently bounded quantities (a day count up
 * to a year is "unlimited" territory anyway; posts-per-run is capped at
 * 40 by the curation guard), so a bounded slider fits better than a free
 * text field a user could type an arbitrary value into.
 *
 * The schedule checkboxes are local state seeded from `settings.scheduleDays`,
 * and the `<input type="time">` is local state seeded from
 * `settings.scheduleTime` ("HH:MM", 24h UTC). Both call `saveSchedule` with
 * the full current `(scheduleDays, scheduleTime)` pair on every change — the
 * day-toggle handler passes along the current time value and vice versa,
 * since the action always persists both together. `saveSchedule` persists the
 * change to `config/settings.json` and re-registers the live cron job (see
 * `lib/scheduler/cron.ts`) in the same request, so the note under this
 * section says the change takes effect immediately rather than on some future
 * scheduler check-in.
 *
 * Run Now lives in the sidebar (see app/Nav.tsx) rather than here — kicking
 * off a pipeline run isn't a settings-configuration action, and it needs to
 * be reachable regardless of which page is open.
 *
 * The voice profile is local state seeded from `settings.voiceProfile`.
 * Per this project's low-ceremony style, every field change (tone notes on
 * blur, example-post/interest add or remove immediately) saves the whole
 * assembled profile object rather than building a diffing form. Removing
 * an example post or an interest asks first: it is an unrecoverable delete
 * of something you typed by hand, and it used to happen on a single click
 * with no confirmation while the Admin tables asked before deleting a log
 * row.
 *
 * Retention pairs a range slider with an "unlimited" switch for each of
 * the two retention settings; checking "unlimited" passes `null` to
 * `saveRetention` instead of the number (the slider itself disables and
 * reads 0 while unlimited is on). Both fields are saved together whenever
 * either changes, since `saveRetention` takes both values at once.
 *
 * Curation's "posts per run" is a single positive-integer field (no
 * unlimited option — Curation Engine's input guard caps the candidate pool
 * at 40 regardless, see CURATION-ENGINE--ranking-logic) seeded from
 * `settings.curationTopN` and saved via `saveCurationTopN` on change.
 *
 * Model checking's four explanatory paragraphs are folded behind a
 * disclosure. They are worth reading once and never again, and open by
 * default they were the longest thing on the page — four paragraphs of
 * prose wrapped around four sliders. The text is unchanged, including the
 * live computed "roughly N minutes" figure.
 *
 * Schedule, voice profile, and retention all apply their local state change
 * optimistically and only persist afterward; each capture the pre-update
 * value and revert local state back to it if the Server Action reports
 * `!result.ok`, so a failed save never leaves the UI showing an unpersisted
 * value with only the status line as a clue. The tone-notes textarea is the
 * one case where "the value before this optimistic update" isn't the
 * previous render's state (it mutates on every keystroke before the save on
 * blur), so it's captured on focus into a ref instead.
 */
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "../../Modal";
import { ConfirmDialog } from "../../ConfirmDialog";
import { StatusMessage } from "../../StatusMessage";
import { Disclosure } from "../../Disclosure";
import { EmptyState } from "../../EmptyState";
import {
  toggleSource,
  addSource,
  saveSchedule,
  saveVoiceProfile,
  saveRetention,
  saveCurationTopN,
  saveModelCheckSettings,
} from "./actions";
import type { Source, Settings, VoiceProfile } from "../../../lib/config/types";

const EMPTY_NEW_SOURCE = { name: "", url: "", category: "" };

/** A panel's last result, carrying whether it succeeded rather than implying it. */
type Status = { text: string; ok: boolean } | null;
const ok = (text: string): Status => ({ text, ok: true });
const failed = (text: string): Status => ({ text, ok: false });

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

// Visual-only grouping: sources are stored as a flat list, but scanning 8+
// of them for the one you want is much easier grouped by category than as
// one undifferentiated column. Preserves each category's first-seen order
// rather than alphabetizing, so a deliberately-ordered sources.json isn't
// visually reshuffled.
function groupByCategory(sources: Source[]): [string, Source[]][] {
  const groups = new Map<string, Source[]>();
  for (const s of sources) {
    const bucket = groups.get(s.category);
    if (bucket) bucket.push(s);
    else groups.set(s.category, [s]);
  }
  return Array.from(groups.entries());
}

/** What a chip Remove is about to delete, kept until it is confirmed. */
type PendingChipRemoval = { kind: "example" | "interest"; index: number; text: string };

export function SettingsForm({ sources, settings }: { sources: Source[]; settings: Settings }) {
  const router = useRouter();
  const sourceGroups = groupByCategory(sources);
  const enabledCount = sources.filter((s) => s.enabled).length;

  const [newSource, setNewSource] = useState(EMPTY_NEW_SOURCE);
  const [addSourceStatus, setAddSourceStatus] = useState<Status>(null);
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});
  const [showAddSource, setShowAddSource] = useState(false);

  const [scheduleDays, setScheduleDays] = useState<string[]>(settings.scheduleDays);
  const [scheduleTime, setScheduleTime] = useState<string>(settings.scheduleTime);
  const [scheduleStatus, setScheduleStatus] = useState<Status>(null);

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(settings.voiceProfile);
  const [newExamplePost, setNewExamplePost] = useState("");
  const [newInterest, setNewInterest] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<Status>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingChipRemoval | null>(null);
  // Snapshot of the voice profile as of the last focus on the tone-notes
  // textarea, used to revert the optimistic update on save failure — the
  // textarea mutates state on every keystroke, so the "previous" value for
  // rollback purposes has to be captured before typing starts, not at blur.
  const voiceProfileBeforeEditRef = useRef<VoiceProfile>(voiceProfile);

  const [postsRetentionDays, setPostsRetentionDays] = useState<number | null>(settings.postsRetentionDays);
  const [candidateRetentionDays, setCandidateRetentionDays] = useState<number | null>(
    settings.candidateRetentionDays
  );
  const [retentionStatus, setRetentionStatus] = useState<Status>(null);

  const [curationTopN, setCurationTopN] = useState<number>(settings.curationTopN);
  const [curationTopNStatus, setCurationTopNStatus] = useState<Status>(null);

  const [checkEnabled, setCheckEnabled] = useState<boolean>(settings.modelHealthCheckEnabled);
  const [healthCheckSecs, setHealthCheckSecs] = useState<number>(Math.round(settings.healthCheckTimeoutMs / 1000));
  const [probeSecs, setProbeSecs] = useState<number>(Math.round(settings.probeTimeoutMs / 1000));
  const [llmCallSecs, setLlmCallSecs] = useState<number>(Math.round(settings.llmCallTimeoutMs / 1000));
  const [modelCheckStatus, setModelCheckStatus] = useState<Status>(null);

  const handleToggleSource = async (name: string) => {
    const result = await toggleSource(name);
    if (!result.ok) {
      setToggleErrors((prev) => ({ ...prev, [name]: result.error ?? "Toggle failed" }));
      return;
    }
    setToggleErrors((prev) => {
      const { [name]: _removed, ...rest } = prev;
      return rest;
    });
    router.refresh();
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await addSource(newSource);
    if (!result.ok) {
      setAddSourceStatus(failed(`Add failed: ${result.error}`));
      return;
    }
    setAddSourceStatus(ok("Source added."));
    setNewSource(EMPTY_NEW_SOURCE);
    setShowAddSource(false);
    router.refresh();
  };

  const handleCancelAddSource = () => {
    setShowAddSource(false);
    setNewSource(EMPTY_NEW_SOURCE);
    setAddSourceStatus(null);
  };

  const handleToggleDay = async (day: string) => {
    const previous = scheduleDays;
    const next = scheduleDays.includes(day)
      ? scheduleDays.filter((d) => d !== day)
      : [...scheduleDays, day];
    setScheduleDays(next);
    const result = await saveSchedule(next, scheduleTime);
    if (!result.ok) {
      setScheduleDays(previous);
      setScheduleStatus(failed(`Save failed: ${result.error}`));
      return;
    }
    setScheduleStatus(ok("Schedule saved."));
    router.refresh();
  };

  const handleScheduleTimeChange = async (time: string) => {
    const previous = scheduleTime;
    setScheduleTime(time);
    const result = await saveSchedule(scheduleDays, time);
    if (!result.ok) {
      setScheduleTime(previous);
      setScheduleStatus(failed(`Save failed: ${result.error}`));
      return;
    }
    setScheduleStatus(ok("Schedule saved."));
    router.refresh();
  };

  const persistVoiceProfile = async (profile: VoiceProfile, previous: VoiceProfile) => {
    const result = await saveVoiceProfile(profile);
    if (!result.ok) {
      setVoiceProfile(previous);
      setVoiceStatus(failed(`Save failed: ${result.error}`));
      return;
    }
    setVoiceStatus(ok("Voice profile saved."));
  };

  const handleToneNotesFocus = () => {
    voiceProfileBeforeEditRef.current = voiceProfile;
  };

  const handleToneNotesBlur = () => {
    persistVoiceProfile(voiceProfile, voiceProfileBeforeEditRef.current);
  };

  const handleAddExamplePost = () => {
    if (!newExamplePost.trim()) return;
    const previous = voiceProfile;
    const next = { ...voiceProfile, examplePosts: [...voiceProfile.examplePosts, newExamplePost] };
    setVoiceProfile(next);
    setNewExamplePost("");
    persistVoiceProfile(next, previous);
  };

  const handleAddInterest = () => {
    if (!newInterest.trim()) return;
    const previous = voiceProfile;
    const next = { ...voiceProfile, interests: [...voiceProfile.interests, newInterest] };
    setVoiceProfile(next);
    setNewInterest("");
    persistVoiceProfile(next, previous);
  };

  const confirmChipRemoval = () => {
    if (!pendingRemoval) return;
    const { kind, index } = pendingRemoval;
    const previous = voiceProfile;
    const next =
      kind === "example"
        ? { ...voiceProfile, examplePosts: voiceProfile.examplePosts.filter((_, i) => i !== index) }
        : { ...voiceProfile, interests: voiceProfile.interests.filter((_, i) => i !== index) };
    setVoiceProfile(next);
    setPendingRemoval(null);
    persistVoiceProfile(next, previous);
  };

  const persistRetention = async (
    posts: number | null,
    candidates: number | null,
    previousPosts: number | null,
    previousCandidates: number | null
  ) => {
    const result = await saveRetention(posts, candidates);
    if (!result.ok) {
      setPostsRetentionDays(previousPosts);
      setCandidateRetentionDays(previousCandidates);
      setRetentionStatus(failed(`Save failed: ${result.error}`));
      return;
    }
    setRetentionStatus(ok("Retention saved."));
  };

  const handlePostsRetentionChange = (value: number | null) => {
    const previousPosts = postsRetentionDays;
    setPostsRetentionDays(value);
    persistRetention(value, candidateRetentionDays, previousPosts, candidateRetentionDays);
  };

  const handleCandidateRetentionChange = (value: number | null) => {
    const previousCandidates = candidateRetentionDays;
    setCandidateRetentionDays(value);
    persistRetention(postsRetentionDays, value, postsRetentionDays, previousCandidates);
  };

  // Seconds in the UI, milliseconds in storage: nobody thinks in milliseconds,
  // and every consumer of these values takes milliseconds.
  const persistModelCheck = async (next: {
    enabled: boolean;
    healthSecs: number;
    probe: number;
    llmCall: number;
  }) => {
    const result = await saveModelCheckSettings({
      modelHealthCheckEnabled: next.enabled,
      healthCheckTimeoutMs: next.healthSecs * 1000,
      probeTimeoutMs: next.probe * 1000,
      llmCallTimeoutMs: next.llmCall * 1000,
    });
    setModelCheckStatus(result.ok ? ok("Model checking saved.") : failed(`Save failed: ${result.error}`));
  };

  // All four sliders persist the whole set, so they share one committer.
  const commitModelCheck = () =>
    persistModelCheck({ enabled: checkEnabled, healthSecs: healthCheckSecs, probe: probeSecs, llmCall: llmCallSecs });

  // Sliders persist on release, not on change: dragging one fires `change`
  // for every intermediate value, which would mean a file write per pixel.
  const sliderCommitProps = {
    onMouseUp: commitModelCheck,
    onTouchEnd: commitModelCheck,
    onKeyUp: commitModelCheck,
  };

  const handleCurationTopNChange = async (value: number) => {
    const previous = curationTopN;
    setCurationTopN(value);
    const result = await saveCurationTopN(value);
    if (!result.ok) {
      setCurationTopN(previous);
      setCurationTopNStatus(failed(`Save failed: ${result.error}`));
      return;
    }
    setCurationTopNStatus(ok("Curation setting saved."));
  };

  const deadProviderMinutes = Math.round((llmCallSecs * 3 + 10) / 60);

  return (
    <div className="config-page">
      <section className="panel" id="sources">
        <div className="panel-head">
          <h2>Sources</h2>
          <span className="panel-head-aside">
            {/* The switches on each row are green; the count of them that are
                on belongs in the same colour. */}
            <span className="cell-yes">{enabledCount} enabled</span>
            <button className="section-action" onClick={() => setShowAddSource(true)}>
              + Add source
            </button>
          </span>
        </div>

        {sources.length === 0 ? (
          <EmptyState hint="Add an RSS or Atom feed above — nothing is ingested until at least one is enabled.">
            No sources yet.
          </EmptyState>
        ) : (
          sourceGroups.map(([category, group]) => (
            <div className="stage-block" key={category}>
              <h3>
                {category} <span className="h3-count">({group.length})</span>
              </h3>
              <div className="rows" style={{ ["--cols" as string]: "minmax(0,1fr) 44px" } as React.CSSProperties}>
                {group.map((s) => (
                  <div key={s.name}>
                    <div className="row">
                      <span className="row-main">
                        <span className="row-title">{s.name}</span>
                        <span className="row-meta data">{s.url}</span>
                      </span>
                      <label className="switch" aria-label={`Enable ${s.name}`}>
                        <input type="checkbox" checked={s.enabled} onChange={() => handleToggleSource(s.name)} />
                        <span className="switch-track" />
                      </label>
                    </div>
                    {toggleErrors[s.name] && (
                      <p className="row-note status-line--danger" role="alert">
                        {toggleErrors[s.name]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        <StatusMessage message={addSourceStatus?.text} tone={addSourceStatus?.ok ? "success" : "danger"} />

        {showAddSource && (
          <Modal
            title="Add a source"
            description="An RSS or Atom feed. Category is free text — it only groups the list above."
            onClose={handleCancelAddSource}
            footer={
              <>
                <button type="button" className="secondary" onClick={handleCancelAddSource}>
                  Cancel
                </button>
                <button
                  type="submit"
                  form="add-source-form"
                  className="primary"
                  disabled={!newSource.name || !newSource.url || !newSource.category}
                >
                  Add source
                </button>
              </>
            }
          >
            {/* Submit lives in the modal footer, outside this element, wired
                back by form="" so Enter still submits. */}
            <form id="add-source-form" className="modal-form" onSubmit={handleAddSource}>
              <label>
                Name
                <input
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  required
                />
              </label>
              <label>
                URL
                <input
                  value={newSource.url}
                  placeholder="https://example.com/feed.xml"
                  onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                  required
                />
              </label>
              <label>
                Category
                <input
                  value={newSource.category}
                  onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                  required
                />
              </label>
            </form>
          </Modal>
        )}
      </section>

      {/* Both small, both about when things happen — they read better as a
          pair than as two full-width bands. */}
      <div className="panel-grid">
        <section className="panel" id="schedule">
          <div className="panel-head">
            <h2>Schedule</h2>
          </div>
          <p className="panel-intro">Schedule changes take effect immediately.</p>
          <div className="day-toggle-group">
            {DAYS.map(({ key, label }) => (
              <label key={key} className="day-toggle">
                <input type="checkbox" checked={scheduleDays.includes(key)} onChange={() => handleToggleDay(key)} />
                {label}
              </label>
            ))}
          </div>
          <label>
            Time (UTC)
            <input type="time" value={scheduleTime} onChange={(e) => handleScheduleTimeChange(e.target.value)} />
          </label>
          <StatusMessage message={scheduleStatus?.text} tone={scheduleStatus?.ok ? "success" : "danger"} />
        </section>

        <section className="panel" id="retention">
          <div className="panel-head">
            <h2>Retention</h2>
          </div>
          <div className="field-row">
            <label>
              Posts retention (days)
              <div className="range-field">
                <input
                  type="range"
                  min={0}
                  max={365}
                  value={postsRetentionDays ?? 0}
                  disabled={postsRetentionDays === null}
                  onChange={(e) => handlePostsRetentionChange(Number(e.target.value))}
                />
                <span className="range-value data">
                  {postsRetentionDays === null ? "Unlimited" : `${postsRetentionDays} day${postsRetentionDays === 1 ? "" : "s"}`}
                </span>
              </div>
            </label>
            <label className="checkbox-label">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={postsRetentionDays === null}
                  onChange={(e) => handlePostsRetentionChange(e.target.checked ? null : 0)}
                />
                <span className="switch-track" />
              </span>
              Unlimited
            </label>
          </div>

          <div className="field-row">
            <label>
              Candidate retention (days)
              <div className="range-field">
                <input
                  type="range"
                  min={0}
                  max={365}
                  value={candidateRetentionDays ?? 0}
                  disabled={candidateRetentionDays === null}
                  onChange={(e) => handleCandidateRetentionChange(Number(e.target.value))}
                />
                <span className="range-value data">
                  {candidateRetentionDays === null
                    ? "Unlimited"
                    : `${candidateRetentionDays} day${candidateRetentionDays === 1 ? "" : "s"}`}
                </span>
              </div>
            </label>
            <label className="checkbox-label">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={candidateRetentionDays === null}
                  onChange={(e) => handleCandidateRetentionChange(e.target.checked ? null : 0)}
                />
                <span className="switch-track" />
              </span>
              Unlimited
            </label>
          </div>

          <StatusMessage message={retentionStatus?.text} tone={retentionStatus?.ok ? "success" : "danger"} />
        </section>
      </div>

      <section className="panel" id="curation">
        <div className="panel-head">
          <h2>Curation</h2>
        </div>
        <p className="panel-intro">
          The upper bound — curation only picks fewer if fewer items are genuinely worth posting.
        </p>
        <label>
          Posts per run
          <div className="range-field">
            <input
              type="range"
              min={1}
              max={40}
              value={curationTopN}
              onChange={(e) => handleCurationTopNChange(Number(e.target.value))}
            />
            <span className="range-value data">{curationTopN} post{curationTopN === 1 ? "" : "s"}</span>
          </div>
        </label>
        <StatusMessage message={curationTopNStatus?.text} tone={curationTopNStatus?.ok ? "success" : "danger"} />
      </section>

      <section className="panel" id="model-checking">
        <div className="panel-head">
          <h2>Model checking</h2>
        </div>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={checkEnabled}
            onChange={(e) => {
              setCheckEnabled(e.target.checked);
              persistModelCheck({ enabled: e.target.checked, healthSecs: healthCheckSecs, probe: probeSecs, llmCall: llmCallSecs });
            }}
          />
          Check the assigned models when the app starts
        </label>

        {checkEnabled && (
          <label>
            Startup check gives up after
            <div className="range-field">
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={healthCheckSecs}
                onChange={(e) => setHealthCheckSecs(Number(e.target.value))}
                {...sliderCommitProps}
              />
              <span className="range-value data">{healthCheckSecs}s</span>
            </div>
          </label>
        )}

        <label>
          &ldquo;Test this model&rdquo; gives up after
          <div className="range-field">
            <input
              type="range"
              min={5}
              max={300}
              step={5}
              value={probeSecs}
              onChange={(e) => setProbeSecs(Number(e.target.value))}
              {...sliderCommitProps}
            />
            <span className="range-value data">{probeSecs}s</span>
          </div>
        </label>

        <label>
          A pipeline call may take up to
          <div className="range-field">
            <input
              type="range"
              min={30}
              max={600}
              step={30}
              value={llmCallSecs}
              onChange={(e) => setLlmCallSecs(Number(e.target.value))}
              {...sliderCommitProps}
            />
            <span className="range-value data">{llmCallSecs}s</span>
          </div>
        </label>

        {/* Four paragraphs of prose wrapped around four sliders made this
            the longest panel on the page, and it is all read-once
            material. Folded, not cut — every word is here, including the
            computed figure, which still recomputes as you drag. */}
        <Disclosure label="What these limits actually mean">
          <div className="disclosure-prose">
            <p className="status-line">
              Two small calls per server start, one per assigned model. Switch it off and nothing is checked, nothing is
              locked, and nothing is spent.
            </p>
            <p className="status-line">
              These two are how long <em>sift</em> waits, not how long the model gets. Run past either and the result is a
              grey &ldquo;no answer yet&rdquo; — never a failure, because a slow model is not a broken one.
            </p>
            <p className="status-line">
              This one <em>is</em> the provider&rsquo;s allowance during a real run, and going over it is a genuine timeout.
              A failed call is retried up to 3 times, so a dead provider costs roughly {deadProviderMinutes} minute
              {deadProviderMinutes === 1 ? "" : "s"} before the run gives up.
            </p>
          </div>
        </Disclosure>

        <StatusMessage message={modelCheckStatus?.text} tone={modelCheckStatus?.ok ? "success" : "danger"} />
      </section>

      <section className="panel" id="voice-profile">
        <div className="panel-head">
          <h2>Voice profile</h2>
        </div>
        <label>
          Tone notes
          <textarea
            value={voiceProfile.toneNotes}
            onChange={(e) => setVoiceProfile({ ...voiceProfile, toneNotes: e.target.value })}
            onFocus={handleToneNotesFocus}
            onBlur={handleToneNotesBlur}
          />
        </label>

        <div className="panel-grid">
          <div className="stage-block">
            <h3>Example posts</h3>
            {voiceProfile.examplePosts.length === 0 ? (
              <p className="status-line">Nothing yet — add a post you liked writing.</p>
            ) : (
              <ul className="chip-list">
                {voiceProfile.examplePosts.map((post, i) => (
                  <li key={`${post}-${i}`} className="chip-row">
                    <span>{post}</span>
                    <button
                      className="icon-button icon-button--danger"
                      onClick={() => setPendingRemoval({ kind: "example", index: i, text: post })}
                      aria-label="Remove example post"
                      title="Remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="field-row">
              <input
                placeholder="new example post"
                value={newExamplePost}
                onChange={(e) => setNewExamplePost(e.target.value)}
              />
              <button onClick={handleAddExamplePost}>Add example post</button>
            </div>
          </div>

          <div className="stage-block">
            <h3>Interests</h3>
            {voiceProfile.interests.length === 0 ? (
              <p className="status-line">Nothing yet — add a topic you write about.</p>
            ) : (
              <ul className="chip-list">
                {voiceProfile.interests.map((interest, i) => (
                  <li key={`${interest}-${i}`} className="chip-row">
                    <span>{interest}</span>
                    <button
                      className="icon-button icon-button--danger"
                      onClick={() => setPendingRemoval({ kind: "interest", index: i, text: interest })}
                      aria-label="Remove interest"
                      title="Remove"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="field-row">
              <input placeholder="new interest" value={newInterest} onChange={(e) => setNewInterest(e.target.value)} />
              <button onClick={handleAddInterest}>Add interest</button>
            </div>
          </div>
        </div>

        <StatusMessage message={voiceStatus?.text} tone={voiceStatus?.ok ? "success" : "danger"} />
      </section>

      {pendingRemoval && (
        <ConfirmDialog
          title={pendingRemoval.kind === "example" ? "Remove example post" : "Remove interest"}
          message={
            <>
              Remove &ldquo;{pendingRemoval.text}&rdquo;? It stops shaping how drafts are written, and it isn&apos;t
              recoverable — you would have to type it again.
            </>
          }
          confirmLabel="Remove"
          onConfirm={confirmChipRemoval}
          onCancel={() => setPendingRemoval(null)}
        />
      )}
    </div>
  );
}
