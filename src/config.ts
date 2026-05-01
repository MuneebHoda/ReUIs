import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ReluiConfig, SubjectConfig } from "./types.js";

export async function loadConfig(configPath: string): Promise<ReluiConfig> {
  const absolutePath = path.resolve(configPath);
  const imported = (await import(`${pathToFileURL(absolutePath).href}?t=${Date.now()}`)) as {
    default?: ReluiConfig;
    config?: ReluiConfig;
  };
  const config = imported.default ?? imported.config;
  if (!config) {
    throw new Error(`Config file ${configPath} must export a default ReluiConfig.`);
  }
  validateConfig(config);
  return config;
}

function validateConfig(config: ReluiConfig): void {
  if (!config.artifactsDir) {
    throw new Error("Config must define artifactsDir.");
  }
  const seen = new Set<string>();
  for (const subject of config.subjects) {
    validateSubject(subject);
    if (seen.has(subject.id)) {
      throw new Error(`Duplicate subject id: ${subject.id}`);
    }
    seen.add(subject.id);
  }
}

function validateSubject(subject: SubjectConfig): void {
  if (!subject.id || !subject.title || !subject.url) {
    throw new Error(`Subject is missing id, title, or url: ${JSON.stringify(subject)}`);
  }
  if (subject.maxDepth < 0) {
    throw new Error(`Subject ${subject.id} has invalid maxDepth.`);
  }
  if (subject.inputProfiles.length === 0) {
    throw new Error(`Subject ${subject.id} must define at least one input profile.`);
  }
}
