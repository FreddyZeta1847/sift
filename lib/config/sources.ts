import { readConfig, configPath } from "./read-config";
import type { Source } from "./types";
import { SEED_SOURCES } from "./seed-sources";

export async function getSources(): Promise<Source[]> {
  return readConfig<Source[]>(configPath("sources.json"), SEED_SOURCES);
}
