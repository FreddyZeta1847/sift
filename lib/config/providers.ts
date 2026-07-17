import { readConfig, configPath } from "./read-config";
import type { Provider } from "./types";

export async function getProviders(): Promise<Provider[]> {
  return readConfig<Provider[]>(configPath("providers.json"), []);
}
