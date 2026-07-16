import { readConfig } from "./read-config";
import type { Source } from "./types";
import { SEED_SOURCES } from "./seed-sources";

export async function getSources(): Promise<Source[]> {
  return readConfig<Source[]>("config/sources.json", SEED_SOURCES);
}
