import { readConfig, writeConfig, configPath } from "./read-config";
import type { Source } from "./types";
import { SEED_SOURCES } from "./seed-sources";

export async function getSources(): Promise<Source[]> {
  return readConfig<Source[]>(configPath("sources.json"), SEED_SOURCES);
}

export async function saveSources(sources: Source[]): Promise<void> {
  return writeConfig(configPath("sources.json"), sources);
}
