import type {
  AppCoverageSummary,
  AssignmentMetrics,
  BaselineResult,
  CounterexampleSummary,
  FaultCoverage,
  InvariantFamilyCoverage,
  StateGraph,
  StateSnapshot,
  SubjectConfig,
  SubjectSummary,
  Violation
} from "../types.js";

export interface ReportModel {
  subjects: SubjectConfig[];
  summaries: SubjectSummary[];
  violations: Violation[];
  baselines: BaselineResult[];
  graphs: Map<string, StateGraph>;
  violationsBySubject: Map<string, Violation[]>;
  baselinesBySubject: Map<string, BaselineResult>;
  assignmentMetrics: AssignmentMetrics;
  appCoverage: AppCoverageSummary[];
  invariantFamilyCoverage: InvariantFamilyCoverage[];
  faultCoverage: FaultCoverage[];
  counterexamples: CounterexampleSummary[];
}

export interface BuildReportModelInput {
  subjects: SubjectConfig[];
  graphs: Map<string, StateGraph>;
  violationsBySubject: Map<string, Violation[]>;
  baselines: BaselineResult[];
}

export function buildReportModel(input: BuildReportModelInput): ReportModel {
  const baselinesBySubject = new Map(input.baselines.map((baseline) => [baseline.subjectId, baseline]));
  const summaries = input.subjects.map((subject) => summarizeSubject(subject, input.graphs.get(subject.id)!, input.violationsBySubject.get(subject.id) ?? [], baselinesBySubject.get(subject.id)));
  const violations = [...input.violationsBySubject.values()].flat();
  const faultCoverage = buildFaultCoverage(input.subjects, input.violationsBySubject, baselinesBySubject);
  const counterexamples = buildCounterexamples(input.subjects, input.graphs, input.violationsBySubject, faultCoverage);
  const assignmentMetrics = buildAssignmentMetrics(summaries, faultCoverage, violations, input.baselines);
  const appCoverage = buildAppCoverage(input.subjects, input.graphs, summaries, faultCoverage);
  const invariantFamilyCoverage = buildInvariantFamilyCoverage(input.subjects, faultCoverage, violations);

  return {
    subjects: input.subjects,
    summaries,
    violations,
    baselines: input.baselines,
    graphs: input.graphs,
    violationsBySubject: input.violationsBySubject,
    baselinesBySubject,
    assignmentMetrics,
    appCoverage,
    invariantFamilyCoverage,
    faultCoverage,
    counterexamples
  };
}

export function summarizeSubject(
  subject: SubjectConfig,
  graph: StateGraph,
  violations: Violation[],
  baseline?: BaselineResult
): SubjectSummary {
  const traceLengths = graph.traces.map((trace) => trace.steps.length);
  const actionSelectors = new Set(graph.traces.flatMap((trace) => trace.steps.map((step) => step.action.selector)));
  return {
    subjectId: subject.id,
    title: subject.title,
    app: subject.app,
    variant: subject.variant,
    expectedFaults: subject.expectedFaults?.length ?? 0,
    relationalViolations: violations.length,
    structuralDetected: baseline?.structural.detected ?? false,
    visualDetected: baseline?.visual.detected ?? false,
    states: graph.stats.states,
    edges: graph.stats.edges,
    traces: graph.stats.traces,
    uniqueActions: actionSelectors.size,
    averageTraceLength: average(traceLengths),
    maxTraceLength: Math.max(...traceLengths, 0),
    durationMs: graph.durationMs
  };
}

export function buildAssignmentMetrics(
  summaries: SubjectSummary[],
  faultCoverage: FaultCoverage[],
  violations: Violation[],
  baselines: BaselineResult[]
): AssignmentMetrics {
  const cleanSummaries = summaries.filter((summary) => summary.expectedFaults === 0);
  return {
    appsTested: new Set(summaries.map((summary) => summary.app)).size,
    appNames: Array.from(new Set(summaries.map((summary) => summary.app))).sort(),
    subjectVariants: summaries.length,
    cleanVariants: cleanSummaries.length,
    faultyVariants: summaries.length - cleanSummaries.length,
    faultsInjected: faultCoverage.length,
    statesDiscovered: sum(summaries, "states"),
    transitionsDiscovered: sum(summaries, "edges"),
    tracesExplored: sum(summaries, "traces"),
    bugsDetected: faultCoverage.filter((fault) => fault.detected).length,
    falsePositives: cleanSummaries.reduce((total, summary) => total + summary.relationalViolations, 0),
    relationalViolations: violations.length,
    structuralDetections: baselines.filter((baseline) => baseline.structural.detected).length,
    visualDetections: baselines.filter((baseline) => baseline.visual.detected).length,
    uniqueActions: sum(summaries, "uniqueActions"),
    runtimeMs: sum(summaries, "durationMs")
  };
}

export function buildAppCoverage(
  subjects: SubjectConfig[],
  graphs: Map<string, StateGraph>,
  summaries: SubjectSummary[],
  faultCoverage: FaultCoverage[]
): AppCoverageSummary[] {
  const summariesByApp = groupBy(summaries, (summary) => summary.app);
  return Array.from(summariesByApp.entries()).map(([app, appSummaries]) => {
    const appSubjects = subjects.filter((subject) => subject.app === app);
    const appGraphs = appSubjects.map((subject) => graphs.get(subject.id)).filter((graph): graph is StateGraph => Boolean(graph));
    const selectors = new Set(appGraphs.flatMap((graph) => graph.traces.flatMap((trace) => trace.steps.map((step) => step.action.selector))));
    const traceLengths = appGraphs.flatMap((graph) => graph.traces.map((trace) => trace.steps.length));
    const faults = faultCoverage.filter((fault) => fault.app === app);
    return {
      app,
      variants: appSummaries.length,
      injectedFaults: faults.length,
      detectedFaults: faults.filter((fault) => fault.detected).length,
      states: sum(appSummaries, "states"),
      transitions: sum(appSummaries, "edges"),
      traces: sum(appSummaries, "traces"),
      uniqueActions: selectors.size,
      averageTraceLength: average(traceLengths),
      maxTraceLength: Math.max(...traceLengths, 0),
      structuralDetections: appSummaries.filter((summary) => summary.structuralDetected).length,
      visualDetections: appSummaries.filter((summary) => summary.visualDetected).length,
      runtimeMs: sum(appSummaries, "durationMs")
    };
  });
}

export function buildInvariantFamilyCoverage(
  subjects: SubjectConfig[],
  faultCoverage: FaultCoverage[],
  violations: Violation[]
): InvariantFamilyCoverage[] {
  const invariantTypesById = new Map<string, Violation["invariantType"]>();
  const configuredByType = new Map<Violation["invariantType"], Set<string>>();
  for (const subject of subjects) {
    for (const invariant of subject.invariants) {
      invariantTypesById.set(invariant.id, invariant.type);
      const configured = configuredByType.get(invariant.type) ?? new Set<string>();
      configured.add(invariant.id);
      configuredByType.set(invariant.type, configured);
    }
  }

  const types = new Set<Violation["invariantType"]>([...configuredByType.keys(), ...violations.map((violation) => violation.invariantType)]);
  return Array.from(types)
    .sort()
    .map((invariantType) => {
      const faultsForType = faultCoverage.filter((fault) =>
        fault.expectedInvariantIds.some((invariantId) => invariantTypesById.get(invariantId) === invariantType)
      );
      return {
        invariantType,
        configuredInvariants: configuredByType.get(invariantType)?.size ?? 0,
        expectedFaults: faultsForType.length,
        detectedFaults: faultsForType.filter((fault) => fault.detected).length,
        violationInstances: violations.filter((violation) => violation.invariantType === invariantType).length
      };
    });
}

export function buildFaultCoverage(
  subjects: SubjectConfig[],
  violationsBySubject: Map<string, Violation[]>,
  baselinesBySubject: Map<string, BaselineResult>
): FaultCoverage[] {
  return subjects.flatMap((subject) => {
    const subjectViolations = violationsBySubject.get(subject.id) ?? [];
    const baseline = baselinesBySubject.get(subject.id);
    const baselineKinds: Array<"structural" | "visual"> = [];
    if (baseline?.structural.detected) {
      baselineKinds.push("structural");
    }
    if (baseline?.visual.detected) {
      baselineKinds.push("visual");
    }

    return (subject.expectedFaults ?? []).map((fault) => {
      const matchingViolations = subjectViolations.filter((violation) => fault.invariantIds.includes(violation.invariantId));
      return {
        faultId: fault.id,
        title: fault.title,
        subjectId: subject.id,
        app: subject.app,
        variant: subject.variant,
        expectedInvariantIds: fault.invariantIds,
        detected: matchingViolations.length > 0,
        detectingInvariantIds: Array.from(new Set(matchingViolations.map((violation) => violation.invariantId))).sort(),
        relationalViolationIds: matchingViolations.map((violation) => violation.id),
        baselineDetected: baselineKinds.length > 0,
        baselineKinds,
        counterexampleId: matchingViolations[0]?.id
      } satisfies FaultCoverage;
    });
  });
}

export function buildCounterexamples(
  subjects: SubjectConfig[],
  graphs: Map<string, StateGraph>,
  violationsBySubject: Map<string, Violation[]>,
  faultCoverage: FaultCoverage[]
): CounterexampleSummary[] {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const faultByViolation = new Map<string, string>();
  for (const fault of faultCoverage) {
    for (const violationId of fault.relationalViolationIds) {
      if (!faultByViolation.has(violationId)) {
        faultByViolation.set(violationId, fault.faultId);
      }
    }
  }

  return [...violationsBySubject.entries()].flatMap(([subjectId, violations]) => {
    const subject = subjectById.get(subjectId);
    const graph = graphs.get(subjectId);
    if (!subject || !graph) {
      return [];
    }
    const statesById = new Map(graph.nodes.map((state) => [state.id, state]));
    const tracesById = new Map(graph.traces.map((trace) => [trace.id, trace]));
    return violations.map((violation) => {
      const firstTrace = tracesById.get(violation.traceIds[0] ?? "");
      const startState = firstTrace ? statesById.get(firstTrace.stateIds[0] ?? "") : undefined;
      const endState = resolveEndState(violation, statesById, firstTrace?.finalStateId);
      const evidenceStates = violation.stateIds.map((stateId) => statesById.get(stateId));
      const screenshotPaths = Array.from(
        new Set([startState?.screenshotPath, ...evidenceStates.map((state) => state?.screenshotPath), endState?.screenshotPath].filter((value): value is string => Boolean(value)))
      );
      return {
        id: violation.id,
        subjectId,
        app: subject.app,
        variant: subject.variant,
        faultId: faultByViolation.get(violation.id),
        invariantId: violation.invariantId,
        invariantType: violation.invariantType,
        severity: violation.severity,
        title: violation.title,
        description: violation.description,
        traceIds: violation.traceIds,
        replaySteps: violation.replaySteps,
        startStateId: startState?.id,
        endStateId: endState?.id,
        startUrl: startState?.normalizedUrl,
        endUrl: endState?.normalizedUrl,
        startText: trimText(startState?.text ?? ""),
        endText: trimText(endState?.text ?? ""),
        screenshotPaths,
        textDiff: simpleTextDiff(startState?.text ?? "", endState?.text ?? "")
      };
    });
  });
}

function resolveEndState(
  violation: Violation,
  statesById: Map<string, StateSnapshot>,
  fallbackStateId?: string
): StateSnapshot | undefined {
  for (const stateId of [...violation.stateIds].reverse()) {
    const state = statesById.get(stateId);
    if (state) {
      return state;
    }
  }
  return fallbackStateId ? statesById.get(fallbackStateId) : undefined;
}

function simpleTextDiff(startText: string, endText: string): string[] {
  const start = trimText(startText);
  const end = trimText(endText);
  if (!start && !end) {
    return [];
  }
  if (start === end) {
    return ["No visible text change; the violation is path- or precondition-based."];
  }
  return [`- ${start}`, `+ ${end}`];
}

function trimText(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 420);
}

function sum(summaries: SubjectSummary[], key: "states" | "edges" | "traces" | "uniqueActions" | "durationMs"): number {
  return summaries.reduce((total, summary) => total + summary[key], 0);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

function groupBy<T>(values: T[], keyFor: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}
