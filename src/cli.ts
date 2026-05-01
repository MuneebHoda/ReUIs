#!/usr/bin/env tsx
import { Command } from "commander";
import { baselineFromConfig, checkFromConfig, exploreFromConfig, reportFromConfig, runAll } from "./pipeline.js";

const program = new Command();

program.name("relui").description("Relational behavioral consistency tester for Web UIs.").version("0.1.0");

program
  .command("run")
  .description("Run exploration, relational checks, baselines, and report generation.")
  .requiredOption("-c, --config <path>", "Path to relui config")
  .action(async (options: { config: string }) => runCommand(() => runAll(options.config)));

program
  .command("explore")
  .description("Explore configured subjects and infer state-transition graphs.")
  .requiredOption("-c, --config <path>", "Path to relui config")
  .action(async (options: { config: string }) => runCommand(() => exploreFromConfig(options.config)));

program
  .command("check")
  .description("Check relational invariants against existing graphs.")
  .requiredOption("-c, --config <path>", "Path to relui config")
  .action(async (options: { config: string }) => runCommand(() => checkFromConfig(options.config)));

program
  .command("baseline")
  .description("Run structural and visual baselines against existing graphs.")
  .requiredOption("-c, --config <path>", "Path to relui config")
  .action(async (options: { config: string }) => runCommand(() => baselineFromConfig(options.config)));

program
  .command("report")
  .description("Generate HTML, JSON, and CSV reports from existing artifacts.")
  .requiredOption("-c, --config <path>", "Path to relui config")
  .action(async (options: { config: string }) => runCommand(() => reportFromConfig(options.config)));

await program.parseAsync(process.argv);

async function runCommand(command: () => Promise<void>): Promise<void> {
  try {
    await command();
  } catch (error) {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  }
}
