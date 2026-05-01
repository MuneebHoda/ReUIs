import path from "node:path";
import { readJson, writeText } from "./util/fs.js";
import type { BaselineResult, StateGraph, SubjectConfig, Violation } from "./types.js";
import { writeReportExports } from "./report/exporters.js";
import { renderHtmlReport } from "./report/html.js";
import { buildReportModel } from "./report/model.js";

export async function generateReport(subjects: SubjectConfig[], artifactsDir: string): Promise<void> {
  const baselines = await readOptionalJson<BaselineResult[]>(path.join(artifactsDir, "baselines.json"), []);
  const graphs = new Map<string, StateGraph>();
  const violationsBySubject = new Map<string, Violation[]>();

  for (const subject of subjects) {
    const graph = await readJson<StateGraph>(path.join(artifactsDir, "subjects", subject.id, "graph.json"));
    const violations = await readOptionalJson<Violation[]>(path.join(artifactsDir, "subjects", subject.id, "violations.json"), []);
    graphs.set(subject.id, graph);
    violationsBySubject.set(subject.id, violations);
  }

  const model = buildReportModel({ subjects, graphs, violationsBySubject, baselines });
  await writeReportExports(model, artifactsDir);
  await writeText(path.join(artifactsDir, "report", "index.html"), renderHtmlReport(model, artifactsDir));
}

async function readOptionalJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(file);
  } catch {
    return fallback;
  }
}
