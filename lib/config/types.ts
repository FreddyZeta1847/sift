export interface Provider {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  kind: "openai-compatible" | "anthropic";
}

export interface Source {
  name: string;
  url: string;
  category: string;
  enabled: boolean;
}

export interface VoiceProfile {
  toneNotes: string;
  examplePosts: string[];
  interests: string[];
}

export interface Settings {
  budgetCapUsd: number | null;
  postsRetentionRuns: number | null;
  scheduleDays: string[];
  voiceProfile: VoiceProfile;
  curationProviderId: string | null;
  curationModel: string | null;
  draftingProviderId: string | null;
  draftingModel: string | null;
}
