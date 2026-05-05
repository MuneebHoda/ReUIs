import path from "node:path";
import { writeJson, writeText } from "../util/fs.js";
import type { ReportTable } from "../types.js";
import { csv, escapeLatex, formatSeconds, titleCase } from "./format.js";
import type { ReportModel } from "./model.js";

export async function writeReportExports(model: ReportModel, artifactsDir: string): Promise<void> {
  await writeJson(path.join(artifactsDir, "summary.json"), model.summaries);
  await writeJson(path.join(artifactsDir, "violations.json"), model.violations);
  await writeJson(path.join(artifactsDir, "assignment_metrics.json"), model.assignmentMetrics);
  await writeJson(path.join(artifactsDir, "coverage_by_app.json"), model.appCoverage);
  await writeJson(path.join(artifactsDir, "invariant_family_coverage.json"), model.invariantFamilyCoverage);
  await writeJson(path.join(artifactsDir, "fault_coverage.json"), model.faultCoverage);
  await writeJson(path.join(artifactsDir, "counterexamples.json"), model.counterexamples);

  await writeText(path.join(artifactsDir, "metrics.csv"), legacyMetricsCsv(model));
  await writeText(path.join(artifactsDir, "violations.csv"), legacyViolationsCsv(model));
  await writeText(path.join(artifactsDir, "assignment_metrics.csv"), assignmentMetricsCsv(model));
  await writeText(path.join(artifactsDir, "fault_coverage.csv"), faultCoverageCsv(model));
  await writeText(path.join(artifactsDir, "coverage_by_app.csv"), coverageByAppCsv(model));
  await writeText(path.join(artifactsDir, "invariant_family_coverage.csv"), invariantFamilyCoverageCsv(model));
  await writeText(path.join(artifactsDir, "baseline_comparison.csv"), baselineComparisonCsv(model));
  await writeText(path.join(artifactsDir, "runtime_by_subject.csv"), runtimeBySubjectCsv(model));
  await writeText(path.join(artifactsDir, "counterexamples.csv"), counterexamplesCsv(model));

  for (const table of buildLatexTables(model)) {
    await writeText(path.join(artifactsDir, "tables", `${table.id}.tex`), latexTable(table));
  }
}

export function buildLatexTables(model: ReportModel): ReportTable[] {
  return [
    benchmarkSubjectsTable(model),
    injectedFaultsTable(model),
    detectionSummaryTable(model),
    coverageByAppTable(model),
    invariantFamilyCoverageTable(model),
    baselineComparisonTable(model),
    runtimeScalabilityTable(model),
    representativeCounterexamplesTable(model)
  ];
}

function legacyMetricsCsv(model: ReportModel): string {
  return csv([
    ["subject", "app", "variant", "expected_faults", "relational_violations", "structural_detected", "visual_detected", "states", "edges", "traces", "duration_ms"],
    ...model.summaries.map((summary) => [
      summary.subjectId,
      summary.app,
      summary.variant,
      summary.expectedFaults,
      summary.relationalViolations,
      summary.structuralDetected,
      summary.visualDetected,
      summary.states,
      summary.edges,
      summary.traces,
      summary.durationMs
    ])
  ]);
}

function legacyViolationsCsv(model: ReportModel): string {
  return csv([
    ["id", "subject", "invariant", "type", "severity", "trace_ids", "state_ids", "title"],
    ...model.violations.map((violation) => [
      violation.id,
      violation.subjectId,
      violation.invariantId,
      violation.invariantType,
      violation.severity,
      violation.traceIds.join("|"),
      violation.stateIds.join("|"),
      violation.title
    ])
  ]);
}

function assignmentMetricsCsv(model: ReportModel): string {
  const metrics = model.assignmentMetrics;
  return csv([
    ["metric", "value"],
    ["apps_tested", `${metrics.appsTested} (${metrics.appNames.join(", ")})`],
    ["subject_variants", metrics.subjectVariants],
    ["clean_variants", metrics.cleanVariants],
    ["faulty_variants", metrics.faultyVariants],
    ["faults_injected", metrics.faultsInjected],
    ["states_discovered", metrics.statesDiscovered],
    ["transitions_discovered", metrics.transitionsDiscovered],
    ["traces_explored", metrics.tracesExplored],
    ["bugs_detected", metrics.bugsDetected],
    ["false_positives_clean_variants", metrics.falsePositives],
    ["relational_violations", metrics.relationalViolations],
    ["structural_baseline_detections", metrics.structuralDetections],
    ["visual_baseline_detections", metrics.visualDetections],
    ["unique_subject_actions", metrics.uniqueActions],
    ["runtime_ms", metrics.runtimeMs],
    ["runtime_seconds", formatSeconds(metrics.runtimeMs)]
  ]);
}

function coverageByAppCsv(model: ReportModel): string {
  return csv([
    ["app", "variants", "injected_faults", "detected_faults", "states", "transitions", "traces", "unique_actions", "avg_trace_length", "max_trace_length", "structural_detections", "visual_detections", "runtime_ms", "runtime_seconds"],
    ...model.appCoverage.map((coverage) => [
      coverage.app,
      coverage.variants,
      coverage.injectedFaults,
      coverage.detectedFaults,
      coverage.states,
      coverage.transitions,
      coverage.traces,
      coverage.uniqueActions,
      coverage.averageTraceLength,
      coverage.maxTraceLength,
      coverage.structuralDetections,
      coverage.visualDetections,
      coverage.runtimeMs,
      formatSeconds(coverage.runtimeMs)
    ])
  ]);
}

function invariantFamilyCoverageCsv(model: ReportModel): string {
  return csv([
    ["invariant_type", "configured_invariants", "expected_faults", "detected_faults", "violation_instances"],
    ...model.invariantFamilyCoverage.map((coverage) => [
      coverage.invariantType,
      coverage.configuredInvariants,
      coverage.expectedFaults,
      coverage.detectedFaults,
      coverage.violationInstances
    ])
  ]);
}

function faultCoverageCsv(model: ReportModel): string {
  return csv([
    ["fault_id", "app", "variant", "title", "expected_invariants", "detected", "detecting_invariants", "violation_ids", "baseline_detected", "baseline_kinds", "counterexample_id"],
    ...model.faultCoverage.map((fault) => [
      fault.faultId,
      fault.app,
      fault.variant,
      fault.title,
      fault.expectedInvariantIds.join("|"),
      fault.detected,
      fault.detectingInvariantIds.join("|"),
      fault.relationalViolationIds.join("|"),
      fault.baselineDetected,
      fault.baselineKinds.join("|"),
      fault.counterexampleId ?? ""
    ])
  ]);
}

function baselineComparisonCsv(model: ReportModel): string {
  return csv([
    ["subject", "app", "variant", "expected_faults", "relui_detected", "relational_violations", "structural_detected", "structural_alerts", "visual_detected", "visual_alerts"],
    ...model.summaries.map((summary) => {
      const baseline = model.baselinesBySubject.get(summary.subjectId);
      return [
        summary.subjectId,
        summary.app,
        summary.variant,
        summary.expectedFaults,
        summary.relationalViolations > 0,
        summary.relationalViolations,
        baseline?.structural.detected ?? false,
        baseline?.structural.alerts.length ?? 0,
        baseline?.visual.detected ?? false,
        baseline?.visual.alerts.length ?? 0
      ];
    })
  ]);
}

function runtimeBySubjectCsv(model: ReportModel): string {
  return csv([
    ["subject", "app", "variant", "states", "transitions", "traces", "unique_actions", "avg_trace_length", "max_trace_length", "runtime_ms", "runtime_seconds", "states_per_second", "transitions_per_second"],
    ...model.summaries.map((summary) => [
      summary.subjectId,
      summary.app,
      summary.variant,
      summary.states,
      summary.edges,
      summary.traces,
      summary.uniqueActions,
      summary.averageTraceLength,
      summary.maxTraceLength,
      summary.durationMs,
      formatSeconds(summary.durationMs),
      rate(summary.states, summary.durationMs),
      rate(summary.edges, summary.durationMs)
    ])
  ]);
}

function counterexamplesCsv(model: ReportModel): string {
  return csv([
    ["id", "fault_id", "subject", "app", "variant", "invariant", "type", "severity", "trace_ids", "start_url", "end_url", "replay_steps"],
    ...representativeCounterexamples(model).map((counterexample) => [
      counterexample.id,
      counterexample.faultId ?? "",
      counterexample.subjectId,
      counterexample.app,
      counterexample.variant,
      counterexample.invariantId,
      counterexample.invariantType,
      counterexample.severity,
      counterexample.traceIds.join("|"),
      counterexample.startUrl ?? "",
      counterexample.endUrl ?? "",
      counterexample.replaySteps.join(" | ")
    ])
  ]);
}

function benchmarkSubjectsTable(model: ReportModel): ReportTable {
  const grouped = groupSummariesByApp(model);
  return {
    id: "benchmark_subjects",
    title: "Benchmark Subjects",
    columns: ["App", "Variants", "Injected Faults", "States", "Transitions", "Traces", "Runtime (s)"],
    rows: Array.from(grouped.entries()).map(([app, summaries]) => [
      titleCase(app),
      summaries.length,
      summaries.reduce((total, summary) => total + summary.expectedFaults, 0),
      summaries.reduce((total, summary) => total + summary.states, 0),
      summaries.reduce((total, summary) => total + summary.edges, 0),
      summaries.reduce((total, summary) => total + summary.traces, 0),
      formatSeconds(summaries.reduce((total, summary) => total + summary.durationMs, 0))
    ])
  };
}

function injectedFaultsTable(model: ReportModel): ReportTable {
  return {
    id: "injected_faults",
    title: "Injected Faults and Relational Oracles",
    columns: ["Fault", "App", "Variant", "Expected Oracle", "Detected"],
    rows: model.faultCoverage.map((fault) => [
      fault.faultId,
      titleCase(fault.app),
      fault.variant,
      fault.expectedInvariantIds.join(", "),
      fault.detected ? "Yes" : "No"
    ])
  };
}

function detectionSummaryTable(model: ReportModel): ReportTable {
  return {
    id: "detection_summary",
    title: "Detection Summary",
    columns: ["Metric", "Value"],
    rows: [
      ["Apps tested", model.assignmentMetrics.appsTested],
      ["Faults injected", model.assignmentMetrics.faultsInjected],
      ["Bugs detected by RelUI", `${model.assignmentMetrics.bugsDetected}/${model.assignmentMetrics.faultsInjected}`],
      ["False positives on clean variants", model.assignmentMetrics.falsePositives],
      ["Structural baseline detections", model.assignmentMetrics.structuralDetections],
      ["Visual baseline detections", model.assignmentMetrics.visualDetections],
      ["Unique subject actions", model.assignmentMetrics.uniqueActions],
      ["Runtime (s)", formatSeconds(model.assignmentMetrics.runtimeMs)]
    ]
  };
}

function coverageByAppTable(model: ReportModel): ReportTable {
  return {
    id: "coverage_by_app",
    title: "Coverage by App",
    columns: ["App", "Variants", "Faults", "Detected", "States", "Trans.", "Traces", "Actions", "Avg Len.", "Max Len.", "Runtime (s)"],
    rows: model.appCoverage.map((coverage) => [
      titleCase(coverage.app),
      coverage.variants,
      coverage.injectedFaults,
      `${coverage.detectedFaults}/${coverage.injectedFaults}`,
      coverage.states,
      coverage.transitions,
      coverage.traces,
      coverage.uniqueActions,
      coverage.averageTraceLength,
      coverage.maxTraceLength,
      formatSeconds(coverage.runtimeMs)
    ])
  };
}

function invariantFamilyCoverageTable(model: ReportModel): ReportTable {
  return {
    id: "invariant_family_coverage",
    title: "Invariant Family Coverage",
    columns: ["Invariant Family", "Configured", "Faults", "Detected", "Violation Instances"],
    rows: model.invariantFamilyCoverage.map((coverage) => [
      coverage.invariantType,
      coverage.configuredInvariants,
      coverage.expectedFaults,
      `${coverage.detectedFaults}/${coverage.expectedFaults}`,
      coverage.violationInstances
    ])
  };
}

function baselineComparisonTable(model: ReportModel): ReportTable {
  return {
    id: "baseline_comparison",
    title: "RelUI vs. Lightweight Baselines",
    columns: ["Fault", "Variant", "RelUI", "Structural", "Visual"],
    rows: model.faultCoverage.map((fault) => [
      fault.faultId,
      fault.variant,
      fault.detected ? "Detected" : "Missed",
      fault.baselineKinds.includes("structural") ? "Detected" : "Missed",
      fault.baselineKinds.includes("visual") ? "Detected" : "Missed"
    ])
  };
}

function runtimeScalabilityTable(model: ReportModel): ReportTable {
  return {
    id: "runtime_scalability",
    title: "Runtime and Model Size by Subject",
    columns: ["Subject", "States", "Transitions", "Traces", "Runtime (s)"],
    rows: model.summaries.map((summary) => [
      summary.subjectId,
      summary.states,
      summary.edges,
      summary.traces,
      formatSeconds(summary.durationMs)
    ])
  };
}

function representativeCounterexamplesTable(model: ReportModel): ReportTable {
  return {
    id: "counterexamples",
    title: "Representative Counterexamples",
    columns: ["Fault", "Invariant", "Replay Steps", "End URL"],
    rows: representativeCounterexamples(model).map((counterexample) => [
      counterexample.faultId ?? counterexample.id,
      counterexample.invariantId,
      counterexample.replaySteps.join("; "),
      counterexample.endUrl ?? ""
    ])
  };
}

export function representativeCounterexamples(model: ReportModel) {
  const ids = new Set(model.faultCoverage.map((fault) => fault.counterexampleId).filter((id): id is string => Boolean(id)));
  return model.counterexamples.filter((counterexample) => ids.has(counterexample.id));
}

function latexTable(table: ReportTable): string {
  const columnSpec = `l${"l".repeat(table.columns.length - 1)}`;
  const header = table.columns.map(escapeLatex).join(" & ");
  const rows = table.rows.map((row) => `${row.map(escapeLatex).join(" & ")} \\\\`).join("\n");
  return [
    `% ${table.title}`,
    `\\begin{tabular}{${columnSpec}}`,
    "\\toprule",
    `${header} \\\\`,
    "\\midrule",
    rows,
    "\\bottomrule",
    "\\end{tabular}",
    ""
  ].join("\n");
}

function groupSummariesByApp(model: ReportModel): Map<string, typeof model.summaries> {
  const grouped = new Map<string, typeof model.summaries>();
  for (const summary of model.summaries) {
    const summaries = grouped.get(summary.app) ?? [];
    summaries.push(summary);
    grouped.set(summary.app, summaries);
  }
  return grouped;
}

function rate(count: number, durationMs: number): string {
  if (durationMs === 0) {
    return "0.00";
  }
  return (count / (durationMs / 1000)).toFixed(2);
}
