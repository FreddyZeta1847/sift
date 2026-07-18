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
 * The schedule checkboxes are local state seeded from `settings.scheduleDays`
 * and call `saveSchedule` with the full updated array on every toggle. This
 * is a **persist-only** control: there is no live cron job yet (SCHEDULER is
 * a later, not-yet-built phase), so the note under this section deliberately
 * says the change "takes effect once the scheduler is running" rather than
 * claiming any immediate rescheduling effect.
 *
 * Run Now uses `useTransition` (mirroring DraftCard's Regenerate button) so
 * the button can show a pending label while `runNow` is in flight, and
 * surfaces either the specific abort reason, "Already running", or success
 * in a status line, refreshing on success so the user can go check the
 * review page.
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
 */
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  toggleSource,
  addSource,
  saveSchedule,
  runNow,
  saveVoiceProfile,
  saveRetention,
} from "./actions";
import type { Source, Settings, VoiceProfile } from "../../../lib/config/types";

const EMPTY_NEW_SOURCE = { name: "", url: "", category: "" };

const DAYS: { key: string; label: string }[] = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

export function SettingsForm({ sources, settings }: { sources: Source[]; settings: Settings }) {
  const router = useRouter();

  const [newSource, setNewSource] = useState(EMPTY_NEW_SOURCE);
  const [addSourceStatus, setAddSourceStatus] = useState<string | null>(null);
  const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});

  const [scheduleDays, setScheduleDays] = useState<string[]>(settings.scheduleDays);
  const [scheduleStatus, setScheduleStatus] = useState<string | null>(null);

  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [isRunning, startRun] = useTransition();

  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile>(settings.voiceProfile);
  const [newExamplePost, setNewExamplePost] = useState("");
  const [newInterest, setNewInterest] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);

  const [postsRetentionRuns, setPostsRetentionRuns] = useState<number | null>(settings.postsRetentionRuns);
  const [candidateRetentionDays, setCandidateRetentionDays] = useState<number | null>(
    settings.candidateRetentionDays
  );
  const [retentionStatus, setRetentionStatus] = useState<string | null>(null);

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
    const next = scheduleDays.includes(day)
      ? scheduleDays.filter((d) => d !== day)
      : [...scheduleDays, day];
    setScheduleDays(next);
    const result = await saveSchedule(next);
    if (!result.ok) {
      setScheduleStatus(`Save failed: ${result.error}`);
      return;
    }
    setScheduleStatus("Schedule saved.");
    router.refresh();
  };

  const handleRunNow = () => {
    startRun(async () => {
      const result = await runNow();
      if (!result.ok) {
        setRunStatus(result.error ?? "Run failed");
        return;
      }
      setRunStatus("Run completed.");
      router.refresh();
    });
  };

  const persistVoiceProfile = async (profile: VoiceProfile) => {
    const result = await saveVoiceProfile(profile);
    if (!result.ok) {
      setVoiceStatus(`Save failed: ${result.error}`);
      return;
    }
    setVoiceStatus("Voice profile saved.");
  };

  const handleToneNotesBlur = () => {
    persistVoiceProfile(voiceProfile);
  };

  const handleAddExamplePost = () => {
    if (!newExamplePost.trim()) return;
    const next = { ...voiceProfile, examplePosts: [...voiceProfile.examplePosts, newExamplePost] };
    setVoiceProfile(next);
    setNewExamplePost("");
    persistVoiceProfile(next);
  };

  const handleRemoveExamplePost = (index: number) => {
    const next = { ...voiceProfile, examplePosts: voiceProfile.examplePosts.filter((_, i) => i !== index) };
    setVoiceProfile(next);
    persistVoiceProfile(next);
  };

  const handleAddInterest = () => {
    if (!newInterest.trim()) return;
    const next = { ...voiceProfile, interests: [...voiceProfile.interests, newInterest] };
    setVoiceProfile(next);
    setNewInterest("");
    persistVoiceProfile(next);
  };

  const handleRemoveInterest = (index: number) => {
    const next = { ...voiceProfile, interests: voiceProfile.interests.filter((_, i) => i !== index) };
    setVoiceProfile(next);
    persistVoiceProfile(next);
  };

  const persistRetention = async (posts: number | null, candidates: number | null) => {
    const result = await saveRetention(posts, candidates);
    if (!result.ok) {
      setRetentionStatus(`Save failed: ${result.error}`);
      return;
    }
    setRetentionStatus("Retention saved.");
  };

  const handlePostsRetentionChange = (value: number | null) => {
    setPostsRetentionRuns(value);
    persistRetention(value, candidateRetentionDays);
  };

  const handleCandidateRetentionChange = (value: number | null) => {
    setCandidateRetentionDays(value);
    persistRetention(postsRetentionRuns, value);
  };

  return (
    <div>
      <section>
        <h2>Sources</h2>
        <ul>
          {sources.map((s) => (
            <li key={s.name}>
              <label>
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={() => handleToggleSource(s.name)}
                />
                {s.name} — {s.url} ({s.category})
              </label>
              {toggleErrors[s.name] && <p role="alert">{toggleErrors[s.name]}</p>}
            </li>
          ))}
        </ul>

        <form onSubmit={handleAddSource}>
          <input
            placeholder="name"
            value={newSource.name}
            onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
            required
          />
          <input
            placeholder="url"
            value={newSource.url}
            onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
            required
          />
          <input
            placeholder="category"
            value={newSource.category}
            onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
            required
          />
          <button type="submit">Add source</button>
        </form>
        {addSourceStatus && <p role="alert">{addSourceStatus}</p>}
      </section>

      <section>
        <h2>Schedule</h2>
        <p>
          Schedule changes take effect once the scheduler is running — this only saves the days for
          later use, it does not reschedule anything right now.
        </p>
        {DAYS.map(({ key, label }) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={scheduleDays.includes(key)}
              onChange={() => handleToggleDay(key)}
            />
            {label}
          </label>
        ))}
        {scheduleStatus && <p role="alert">{scheduleStatus}</p>}
      </section>

      <section>
        <h2>Run Now</h2>
        <button onClick={handleRunNow} disabled={isRunning}>
          {isRunning ? "Running…" : "Run Now"}
        </button>
        {runStatus && <p role="alert">{runStatus}</p>}
      </section>

      <section>
        <h2>Voice profile</h2>
        <label>
          Tone notes
          <textarea
            value={voiceProfile.toneNotes}
            onChange={(e) => setVoiceProfile({ ...voiceProfile, toneNotes: e.target.value })}
            onBlur={handleToneNotesBlur}
          />
        </label>

        <div>
          <h3>Example posts</h3>
          <ul>
            {voiceProfile.examplePosts.map((post, i) => (
              <li key={i}>
                {post}
                <button onClick={() => handleRemoveExamplePost(i)}>Remove</button>
              </li>
            ))}
          </ul>
          <input
            placeholder="new example post"
            value={newExamplePost}
            onChange={(e) => setNewExamplePost(e.target.value)}
          />
          <button onClick={handleAddExamplePost}>Add example post</button>
        </div>

        <div>
          <h3>Interests</h3>
          <ul>
            {voiceProfile.interests.map((interest, i) => (
              <li key={i}>
                {interest}
                <button onClick={() => handleRemoveInterest(i)}>Remove</button>
              </li>
            ))}
          </ul>
          <input
            placeholder="new interest"
            value={newInterest}
            onChange={(e) => setNewInterest(e.target.value)}
          />
          <button onClick={handleAddInterest}>Add interest</button>
        </div>

        {voiceStatus && <p role="alert">{voiceStatus}</p>}
      </section>

      <section>
        <h2>Retention</h2>
        <label>
          Posts retention (runs)
          <input
            type="number"
            min={0}
            value={postsRetentionRuns ?? ""}
            disabled={postsRetentionRuns === null}
            onChange={(e) => handlePostsRetentionChange(e.target.value === "" ? null : Number(e.target.value))}
          />
          <label>
            <input
              type="checkbox"
              checked={postsRetentionRuns === null}
              onChange={(e) => handlePostsRetentionChange(e.target.checked ? null : 0)}
            />
            Unlimited
          </label>
        </label>

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
          <label>
            <input
              type="checkbox"
              checked={candidateRetentionDays === null}
              onChange={(e) => handleCandidateRetentionChange(e.target.checked ? null : 0)}
            />
            Unlimited
          </label>
        </label>

        {retentionStatus && <p role="alert">{retentionStatus}</p>}
      </section>
    </div>
  );
}
