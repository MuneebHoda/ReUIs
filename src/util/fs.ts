import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function cleanDir(dir: string): Promise<void> {
  await rm(dir, { force: true, recursive: true });
  await ensureDir(dir);
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(file));
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function writeText(file: string, value: string): Promise<void> {
  await ensureDir(path.dirname(file));
  await writeFile(file, value, "utf8");
}
