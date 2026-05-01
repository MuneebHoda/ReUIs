import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readJson, writeJson } from "./util/fs.js";
import type { BaselineAlert, BaselineResult, StateGraph, SubjectConfig } from "./types.js";

export async function runBaselines(subjects: SubjectConfig[], artifactsDir: string): Promise<BaselineResult[]> {
  const graphs = new Map<string, StateGraph>();
  for (const subject of subjects) {
    graphs.set(subject.id, await readJson<StateGraph>(path.join(artifactsDir, "subjects", subject.id, "graph.json")));
  }

  const results = subjects.map((subject) => {
    const graph = graphs.get(subject.id)!;
    const cleanGraph = subject.cleanSubjectId ? graphs.get(subject.cleanSubjectId) : undefined;
    return baselineForSubject(subject, graph, cleanGraph);
  });

  await writeJson(path.join(artifactsDir, "baselines.json"), results);
  return results;
}

function baselineForSubject(subject: SubjectConfig, graph: StateGraph, cleanGraph?: StateGraph): BaselineResult {
  if (!cleanGraph || subject.id === subject.cleanSubjectId) {
    return {
      subjectId: subject.id,
      cleanSubjectId: subject.cleanSubjectId,
      structural: { detected: false, alerts: [] },
      visual: { detected: false, alerts: [] }
    };
  }

  const structuralAlerts = structuralAlertsFor(graph, cleanGraph);
  const visualAlerts = visualAlertsFor(graph, cleanGraph);
  return {
    subjectId: subject.id,
    cleanSubjectId: subject.cleanSubjectId,
    structural: { detected: structuralAlerts.length > 0, alerts: structuralAlerts },
    visual: { detected: visualAlerts.length > 0, alerts: visualAlerts }
  };
}

function structuralAlertsFor(graph: StateGraph, cleanGraph: StateGraph): BaselineAlert[] {
  const cleanControlSignatures = new Set(cleanGraph.nodes.map((node) => node.controlSignature));
  const alerts: BaselineAlert[] = [];
  for (const node of graph.nodes) {
    if (!cleanControlSignatures.has(node.controlSignature)) {
      alerts.push({
        kind: "structural",
        message: `State ${node.id} has a control structure not seen in the clean variant.`
      });
    }
    if (alerts.length >= 5) {
      break;
    }
  }
  return alerts;
}

function visualAlertsFor(graph: StateGraph, cleanGraph: StateGraph): BaselineAlert[] {
  const cleanBySignature = new Map(cleanGraph.traces.map((trace) => [trace.signature, trace]));
  const cleanStates = new Map(cleanGraph.nodes.map((node) => [node.id, node]));
  const states = new Map(graph.nodes.map((node) => [node.id, node]));
  const alerts: BaselineAlert[] = [];

  for (const trace of graph.traces) {
    const cleanTrace = cleanBySignature.get(trace.signature);
    if (!cleanTrace) {
      continue;
    }
    const state = states.get(trace.finalStateId);
    const cleanState = cleanStates.get(cleanTrace.finalStateId);
    if (!state?.screenshotPath || !cleanState?.screenshotPath) {
      continue;
    }
    const score = diffPng(cleanState.screenshotPath, state.screenshotPath);
    if (score !== undefined && score > 0.18) {
      alerts.push({
        kind: "visual",
        message: `Trace '${trace.signature}' visually diverges from the clean variant.`,
        traceSignature: trace.signature,
        score
      });
    }
    if (alerts.length >= 5) {
      break;
    }
  }
  return alerts;
}

function diffPng(leftPath: string, rightPath: string): number | undefined {
  if (!existsSync(leftPath) || !existsSync(rightPath)) {
    return undefined;
  }
  const left = PNG.sync.read(readFileSync(leftPath));
  const right = PNG.sync.read(readFileSync(rightPath));
  if (left.width !== right.width || left.height !== right.height) {
    return 1;
  }
  const diff = new PNG({ width: left.width, height: left.height });
  const changed = pixelmatch(left.data, right.data, diff.data, left.width, left.height, { threshold: 0.18 });
  return changed / (left.width * left.height);
}
