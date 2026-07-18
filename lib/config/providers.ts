import { readConfig, writeConfig, configPath } from "./read-config";
import type { Provider } from "./types";

export async function getProviders(): Promise<Provider[]> {
  return readConfig<Provider[]>(configPath("providers.json"), []);
}

export async function saveProviders(providers: Provider[]): Promise<void> {
  return writeConfig(configPath("providers.json"), providers);
}
