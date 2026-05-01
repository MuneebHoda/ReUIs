import path from "node:path";
import { runBaselines } from "./baselines.js";
import { loadConfig } from "./config.js";
import { exploreSubject } from "./explorer.js";
import { checkSubject } from "./invariants.js";
import { generateReport } from "./report.js";
import { startManagedServer, type ManagedServer } from "./server.js";
import { cleanDir, readJson } from "./util/fs.js";
import type { ReluiConfig, StateGraph } from "./types.js";

export async function runAll(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  await cleanDir(config.artifactsDir);
  await withServer(config, async () => {
    await exploreAll(config);
    await checkAll(config);
    await runBaselines(config.subjects, config.artifactsDir);
    await generateReport(config.subjects, config.artifactsDir);
  });
}

export async function exploreFromConfig(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  await cleanDir(config.artifactsDir);
  await withServer(config, async () => {
    await exploreAll(config);
  });
}

export async function checkFromConfig(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  await withServer(config, async () => {
    await checkAll(config);
  });
}

export async function baselineFromConfig(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  await runBaselines(config.subjects, config.artifactsDir);
}

export async function reportFromConfig(configPath: string): Promise<void> {
  const config = await loadConfig(configPath);
  await generateReport(config.subjects, config.artifactsDir);
}

async function exploreAll(config: ReluiConfig): Promise<void> {
  for (const subject of config.subjects) {
    console.log(`Exploring ${subject.id}...`);
    await exploreSubject(subject, {
      artifactsDir: config.artifactsDir,
      headless: config.browser?.headless ?? true,
      viewport: config.browser?.viewport
    });
  }
}

async function checkAll(config: ReluiConfig): Promise<void> {
  for (const subject of config.subjects) {
    console.log(`Checking ${subject.id}...`);
    const graph = await readJson<StateGraph>(path.join(config.artifactsDir, "subjects", subject.id, "graph.json"));
    await checkSubject(subject, graph, config.artifactsDir);
  }
}

async function withServer(config: ReluiConfig, callback: () => Promise<void>): Promise<void> {
  let server: ManagedServer | undefined;
  try {
    if (config.server) {
      console.log(`Starting benchmark server: ${config.server.command}`);
      server = await startManagedServer(config.server.command, config.server.readyUrl, config.server.startupTimeoutMs);
    }
    await callback();
  } finally {
    await server?.stop();
  }
}
