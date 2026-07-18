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
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    throw new Error(
      `Malformed JSON in ${filePath}: ${(err as Error).message}`
    );
  }
}

export async function writeConfig<T>(filePath: string, data: T): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(data, null, 2));
}
