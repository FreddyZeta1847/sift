import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export function getConfigDir(): string {
  return process.env.SIFT_CONFIG_DIR ?? "config";
}

export function configPath(fileName: string): string {
  return join(getConfigDir(), fileName);
}

export async function readConfig<T>(filePath: string, defaults: T): Promise<T> {
  if (!existsSync(filePath)) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, JSON.stringify(defaults, null, 2));
    return defaults;
  }

  const raw = await readFile(filePath, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Malformed JSON in ${filePath}: ${(err as Error).message}`
    );
  }

  // Shallow-merge onto defaults rather than trusting the file's shape
  // as-is: an installation's config file was written before a field
  // existed (e.g. a new Settings property added in a later version)
  // otherwise silently comes back `undefined` at runtime despite the
  // type claiming it's required — a real correctness bug, not just a
  // missing-value UI quirk, for anything that reads that field directly
  // (like building a prompt string from it). Only for plain objects
  // (settings.json's shape) — providers.json/sources.json store arrays,
  // and `{...anArray}` would turn `[{...}]` into `{"0": {...}}`, which is
  // not a merge, it's data corruption.
  if (
    !Array.isArray(parsed) &&
    !Array.isArray(defaults) &&
    typeof parsed === "object" &&
    parsed !== null &&
    typeof defaults === "object" &&
    defaults !== null
  ) {
    return { ...defaults, ...parsed } as T;
  }
  return parsed as T;
}

export async function writeConfig<T>(filePath: string, data: T): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(data, null, 2));
}
