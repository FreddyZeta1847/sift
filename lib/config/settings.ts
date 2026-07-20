import { readConfig, writeConfig, configPath } from "./read-config";
import type { Settings } from "./types";

const DEFAULT_SETTINGS: Settings = {
  budgetCapUsd: null,
  postsRetentionDays: null,
  candidateRetentionDays: null,
  scheduleDays: [],
  scheduleTime: "09:00",
  voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
  curationProviderId: null,
  curationModel: null,
  draftingProviderId: null,
  draftingModel: null,
  curationTopN: 3,
};

export async function getSettings(): Promise<Settings> {
  return readConfig<Settings>(configPath("settings.json"), DEFAULT_SETTINGS);
}

export async function saveSettings(settings: Settings): Promise<void> {
  return writeConfig(configPath("settings.json"), settings);
}
