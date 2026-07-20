/**
 * Interactive form for the Settings page (`/config/settings`).
 *
 * Client Component following the same interaction pattern established by
 * `app/config/api/ApiConfigForm.tsx`: local `useState` for in-progress
 * input, `useRouter().refresh()` after a successful mutation so the Server
 * Component re-fetches fresh `sources`/`settings` props, and a
 * `<p role="alert">{status}</p>` per section for both success and failure
 * messages.
 *
 * Sources are rendered directly from the `sources` prop (not copied into
 * local state) so a `router.refresh()` after toggle/add immediately reflects
 * the new list; only the add-source mini-form is local state, since that's
 * user-in-progress input. There is no delete-source action in this task's
 * scope — disabling via the toggle is the only way to remove a source from
 * active use.
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
 * Run Now itself now lives in the global top nav (see app/Nav.tsx) rather
 * than here — kicking off a pipeline run isn't a settings-configuration
 * action, and it needs to be reachable regardless of which page is open.
 *
 * The voice profile is local state seeded from `settings.voiceProfile`.
 * Per this project's low-ceremony style, every field change (tone notes on
 * blur, example-post/interest add or remove immediately) saves the whole
 * assembled profile object rather than building a diffing form.
 *
 * Retention pairs a number input with an "unlimited" checkbox for each of
 * the two retention settings; checking "unlimited" passes `null` to
 * `saveRetention` instead of the number. Both fields are saved together
 * whenever either changes, since `saveRetention` takes both values at once.
 *
 * Curation's "posts per run" is a single positive-integer field (no
 * unlimited option — Curation Engine's input guard caps the candidate pool
 * at 40 regardless, see CURATION-ENGINE--ranking-logic) seeded from
 * `settings.curationTopN` and saved via `saveCurationTopN` on change.
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
import {
  toggleSource,
  addSource,
  saveSchedule,
  saveVoiceProfile,
  saveRetention,
  saveCurationTopN,
} from "./actions";
import type { Source, Settings, VoiceProfile } from "../../../lib/config/types";

const EMPTY_NEW_SOURCE = { name: "", url: "", category: "" };

// Visual-only helper: every failure message produced in this file follows
// an "X failed: ..." shape (see the handlers below), so matching that
// substring is enough to apply the danger tint without adding any new
// state — a plain success sentence falls through to the default, quieter
// `.status-line` tone.
function statusTone(message: string): string {
  return /failed/i.test(message) ? "status-line status-line--danger" : "status-line";
}

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

export function SettingsForm({ sources, settings }: { sources: Source[]; settings: Settings }) {
  const router = useRouter();
  const sourceGroups = groupByCategory(sources);

  const [newSource, setNewSource] = useState(EMPTY_NEW_SOURCE);
  const [addSourceStatus, setAddSourceStatus] = useState<string | null>(null);
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});

  const [scheduleDays, setScheduleDays] = useState<string[]>(settings.scheduleDays);
  const [scheduleTime, setScheduleTime] = useState<string>(settings.scheduleTime);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(settings.voiceProfile);
  const [newExamplePost, setNewExamplePost] = useState("");
  const [newInterest, setNewInterest] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  // Snapshot of the voice profile as of the last focus on the tone-notes
  // textarea, used to revert the optimistic update on save failure — the
  // textarea mutates state on every keystroke, so the "previous" value for
  // rollback purposes has to be captured before typing starts, not at blur.
  const voiceProfileBeforeEditRef = useRef<VoiceProfile>(voiceProfile);

  const [postsRetentionDays, setPostsRetentionDays] = useState<number | null>(settings.postsRetentionDays);
  const [candidateRetentionDays, setCandidateRetentionDays] = useState<number | null>(
    settings.candidateRetentionDays
  );
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);

  const [curationTopN, setCurationTopN] = useState<number>(settings.curationTopN);
  const [curationTopNStatus, setCurationTopNStatus] = useState<string | null>(null);

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
      setAddSourceStatus(`Add failed: ${result.error}`);
      return;
    }
    setAddSourceStatus("Source added.");
    setNewSource(EMPTY_NEW_SOURCE);
    router.refresh();
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
      setScheduleStatus(`Save failed: ${result.error}`);
      return;
    }
    setScheduleStatus("Schedule saved.");
    router.refresh();
  };

  const handleScheduleTimeChange = async (time: string) => {
    const previous = scheduleTime;
    setScheduleTime(time);
    const result = await saveSchedule(scheduleDays, time);
    if (!result.ok) {
      setScheduleTime(previous);
      setScheduleStatus(`Save failed: ${result.error}`);
      return;
    }
    setScheduleStatus("Schedule saved.");
    router.refresh();
  };

  const persistVoiceProfile = async (profile: VoiceProfile, previous: VoiceProfile) => {
    const result = await saveVoiceProfile(profile);
    if (!result.ok) {
      setVoiceProfile(previous);
      setVoiceStatus(`Save failed: ${result.error}`);
      return;
    }
    setVoiceStatus("Voice profile saved.");
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

  const handleRemoveExamplePost = (index: number) => {
    const previous = voiceProfile;
    const next = { ...voiceProfile, examplePosts: voiceProfile.examplePosts.filter((_, i) => i !== index) };
    setVoiceProfile(next);
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

  const handleRemoveInterest = (index: number) => {
    const previous = voiceProfile;
    const next = { ...voiceProfile, interests: voiceProfile.interests.filter((_, i) => i !== index) };
    setVoiceProfile(next);
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
      setRetentionStatus(`Save failed: ${result.error}`);
      return;
    }
    setRetentionStatus("Retention saved.");
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

  const handleCurationTopNChange = async (value: number) => {
    const previous = curationTopN;
    setCurationTopN(value);
    const result = await saveCurationTopN(value);
    if (!result.ok) {
      setCurationTopN(previous);
      setCurationTopNStatus(`Save failed: ${result.error}`);
      return;
    }
    setCurationTopNStatus("Curation setting saved.");
  };

  return (
    <div className="config-page config-page--with-nav">
      <nav className="config-nav" aria-label="Settings sections">
        <a href="#sources">Sources</a>
        <a href="#schedule">Schedule</a>
        <a href="#curation">Curation</a>
        <a href="#voice-profile">Voice profile</a>
        <a href="#retention">Retention</a>
      </nav>
      <div className="config-content">
      <section id="sources">
        <h2>Sources</h2>
        {sourceGroups.map(([category, group]) => (
          <div className="stage-block" key={category}>
            <h3>
              {category} <span className="status-line" style={{ display: "inline" }}>({group.length})</span>
            </h3>
            <ul className="list">
              {group.map((s) => (
                <li key={s.name} className="list-row">
                  <label className="checkbox-label">
                    <input type="checkbox" checked={s.enabled} onChange={() => handleToggleSource(s.name)} />
                    <span className="list-row-main">
                      <span className="list-row-title">{s.name}</span>
                      <span className="list-row-meta data">{s.url}</span>
                    </span>
                  </label>
                  {toggleErrors[s.name] && (
                    <p className="status-line status-line--danger" role="alert">
                      {toggleErrors[s.name]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <form className="add-form row-fields" onSubmit={handleAddSource}>
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
          <div className="row-actions">
            <button type="submit">Add source</button>
          </div>
        </form>
        {addSourceStatus && (
          <p className={statusTone(addSourceStatus)} role="alert">
            {addSourceStatus}
          </p>
        )}
      </section>

      <section id="schedule">
        <h2>Schedule</h2>
        <p className="status-line">Schedule changes take effect immediately.</p>
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
        {scheduleStatus && (
          <p className={statusTone(scheduleStatus)} role="alert">
            {scheduleStatus}
          </p>
        )}
      </section>

      <section id="curation">
        <h2>Curation</h2>
        <label>
          Posts per run
          <input
            type="number"
            min={1}
            max={40}
            value={curationTopN}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (value >= 1) handleCurationTopNChange(value);
            }}
          />
        </label>
        <p className="status-line">
          The upper bound — curation only picks fewer if fewer items are genuinely worth posting.
        </p>
        {curationTopNStatus && (
          <p className={statusTone(curationTopNStatus)} role="alert">
            {curationTopNStatus}
          </p>
        )}
      </section>

      <section id="voice-profile">
        <h2>Voice profile</h2>
        <label>
          Tone notes
          <textarea
            value={voiceProfile.toneNotes}
            onChange={(e) => setVoiceProfile({ ...voiceProfile, toneNotes: e.target.value })}
            onFocus={handleToneNotesFocus}
            onBlur={handleToneNotesBlur}
          />
        </label>

        <div className="stage-block">
          <h3>Example posts</h3>
          <ul className="chip-list">
            {voiceProfile.examplePosts.map((post, i) => (
              <li key={`${post}-${i}`} className="chip-row">
                <span>{post}</span>
                <button onClick={() => handleRemoveExamplePost(i)}>Remove</button>
              </li>
            ))}
          </ul>
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
          <ul className="chip-list">
            {voiceProfile.interests.map((interest, i) => (
              <li key={`${interest}-${i}`} className="chip-row">
                <span>{interest}</span>
                <button onClick={() => handleRemoveInterest(i)}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="field-row">
            <input placeholder="new interest" value={newInterest} onChange={(e) => setNewInterest(e.target.value)} />
            <button onClick={handleAddInterest}>Add interest</button>
          </div>
        </div>

        {voiceStatus && (
          <p className={statusTone(voiceStatus)} role="alert">
            {voiceStatus}
          </p>
        )}
      </section>

      <section id="retention">
        <h2>Retention</h2>
        <div className="field-row">
          <label>
            Posts retention (days)
            <input
              type="number"
              min={0}
              value={postsRetentionDays ?? ""}
              disabled={postsRetentionDays === null}
              onChange={(e) => handlePostsRetentionChange(e.target.value === "" ? null : Number(e.target.value))}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={postsRetentionDays === null}
              onChange={(e) => handlePostsRetentionChange(e.target.checked ? null : 0)}
            />
            Unlimited
          </label>
        </div>

        <div className="field-row">
          <label>
            Candidate retention (days)
            <input
              type="number"
              min={0}
              value={candidateRetentionDays ?? ""}
              disabled={candidateRetentionDays === null}
              onChange={(e) =>
                handleCandidateRetentionChange(e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={candidateRetentionDays === null}
              onChange={(e) => handleCandidateRetentionChange(e.target.checked ? null : 0)}
            />
            Unlimited
          </label>
        </div>

        {retentionStatus && (
          <p className={statusTone(retentionStatus)} role="alert">
            {retentionStatus}
          </p>
        )}
      </section>
      </div>
    </div>
  );
}
