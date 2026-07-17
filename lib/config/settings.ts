import { readConfig, configPath } from "./read-config";
import type { Settings } from "./types";

const DEFAULT_SETTINGS: Settings = {
  budgetCapUsd: null,
  postsRetentionRuns: null,
  scheduleDays: [],
  voiceProfile: { toneNotes: "", examplePosts: [], interests: [] },
  curationProviderId: null,
  curationModel: null,
  draftingProviderId: null,
  draftingModel: null,
};

export async function getSettings(): Promise<Settings> {
  return readConfig<Settings>(configPath("settings.json"), DEFAULT_SETTINGS);
}
