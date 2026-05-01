import path from "node:path";
import { matchesState } from "./canonicalize.js";
import { writeJson } from "./util/fs.js";
import { shortHash } from "./util/hash.js";
import type {
  RelationalInvariant,
  StateGraph,
  StateMatcher,
  StateSnapshot,
  SubjectConfig,
  TraceRecord,
  Violation
} from "./types.js";

export async function checkSubject(subject: SubjectConfig, graph: StateGraph, artifactsDir: string): Promise<Violation[]> {
  const checker = new InvariantChecker(subject, graph);
  const violations = checker.check();
  await writeJson(path.join(artifactsDir, "subjects", subject.id, "violations.json"), violations);
  return violations;
}

class InvariantChecker {
  private readonly statesById = new Map<string, StateSnapshot>();
  private readonly tracesById = new Map<string, TraceRecord>();

  constructor(
    private readonly subject: SubjectConfig,
    private readonly graph: StateGraph
  ) {
    for (const state of graph.nodes) {
      this.statesById.set(state.id, state);
    }
    for (const trace of graph.traces) {
      this.tracesById.set(trace.id, trace);
    }
  }

  check(): Violation[] {
    const violations: Violation[] = [];
    for (const invariant of this.subject.invariants) {
      if (invariant.type === "auth-precondition") {
        violations.push(...this.checkAuthPrecondition(invariant));
      } else if (invariant.type === "validation-blocking") {
        violations.push(...this.checkValidationBlocking(invariant));
      } else if (invariant.type === "action-forbidden-state") {
        violations.push(...this.checkActionForbiddenState(invariant));
      } else if (invariant.type === "forbidden-transition") {
        violations.push(...this.checkForbiddenTransition(invariant));
      } else if (invariant.type === "path-equivalence") {
        violations.push(...this.checkPathEquivalence(invariant));
      }
    }
    return violations;
  }

  private checkAuthPrecondition(invariant: Extract<RelationalInvariant, { type: "auth-precondition" }>): Violation[] {
    return this.graph.traces
      .filter((trace) => this.traceFinalStateMatches(trace, invariant.target))
      .filter((trace) => !hasAnySelector(trace, invariant.requiredActionSelectors))
      .map((trace) =>
        this.violation(invariant, [trace], trace.stateIds, {
          missingRequiredActions: invariant.requiredActionSelectors,
          finalState: trace.finalStateId
        })
      );
  }

  private checkValidationBlocking(invariant: Extract<RelationalInvariant, { type: "validation-blocking" }>): Violation[] {
    const violations: Violation[] = [];
    for (const trace of this.graph.traces) {
      for (let index = 0; index < trace.steps.length; index += 1) {
        const step = trace.steps[index]!;
        const applies =
          invariant.invalidProfiles.includes(step.profileName) &&
          (!invariant.actionSelectors || invariant.actionSelectors.includes(step.action.selector));
        if (!applies) {
          continue;
        }
        const nextStateId = trace.stateIds[index + 1];
        const nextState = nextStateId ? this.statesById.get(nextStateId) : undefined;
        if (nextState && matchesState(nextState, invariant.forbidden)) {
          violations.push(
            this.violation(invariant, [trace], trace.stateIds.slice(0, index + 2), {
              invalidProfiles: invariant.invalidProfiles,
              actionSelector: step.action.selector,
              forbiddenState: nextStateId
            })
          );
        }
      }
    }
    return violations;
  }

  private checkActionForbiddenState(invariant: Extract<RelationalInvariant, { type: "action-forbidden-state" }>): Violation[] {
    const violations: Violation[] = [];
    for (const trace of this.graph.traces) {
      const actionIndex = trace.steps.findIndex((step) => invariant.actionSelectors.includes(step.action.selector));
      if (actionIndex === -1) {
        continue;
      }
      const candidateStateIds =
        invariant.scope === "immediate" ? trace.stateIds.slice(actionIndex + 1, actionIndex + 2) : trace.stateIds.slice(actionIndex + 1);
      const forbiddenStateIds = candidateStateIds.filter((stateId) => {
        const state = this.statesById.get(stateId);
        return state ? matchesState(state, invariant.forbiddenAfterAction) : false;
      });
      if (forbiddenStateIds.length > 0) {
        violations.push(
          this.violation(invariant, [trace], trace.stateIds, {
            actionSelectors: invariant.actionSelectors,
            forbiddenStateIds
          })
        );
      }
    }
    return violations;
  }

  private checkForbiddenTransition(invariant: Extract<RelationalInvariant, { type: "forbidden-transition" }>): Violation[] {
    const violations: Violation[] = [];
    for (const edge of this.graph.edges) {
      const from = this.statesById.get(edge.from);
      const to = this.statesById.get(edge.to);
      if (!from || !to) {
        continue;
      }
      const selectorAllowed = !invariant.actionSelectors || invariant.actionSelectors.includes(edge.selector);
      if (selectorAllowed && matchesState(from, invariant.from) && matchesState(to, invariant.to)) {
        const traces = edge.traceIds.map((id) => this.tracesById.get(id)).filter(Boolean) as TraceRecord[];
        violations.push(
          this.violation(invariant, traces.slice(0, 1), [edge.from, edge.to], {
            edgeId: edge.id,
            selector: edge.selector,
            from: edge.from,
            to: edge.to
          })
        );
      }
    }
    return violations;
  }

  private checkPathEquivalence(invariant: Extract<RelationalInvariant, { type: "path-equivalence" }>): Violation[] {
    const endpointTraces = this.graph.traces
      .filter((trace) => this.traceFinalStateMatches(trace, invariant.endpoint))
      .filter((trace) => {
        const selectorMatch =
          !invariant.candidateActionSelectors ||
          invariant.candidateActionSelectors.includes(trace.steps[trace.steps.length - 1]?.action.selector ?? "");
        const profileMatch = !invariant.profiles || trace.steps.some((step) => invariant.profiles!.includes(step.profileName));
        return selectorMatch && profileMatch;
      });
    if (endpointTraces.length < (invariant.minDistinctPaths ?? 2)) {
      return [];
    }
    const byFingerprint = new Map<string, TraceRecord[]>();
    for (const trace of endpointTraces) {
      const state = this.statesById.get(trace.finalStateId);
      if (!state) {
        continue;
      }
      const bucket = byFingerprint.get(state.semanticFingerprint) ?? [];
      bucket.push(trace);
      byFingerprint.set(state.semanticFingerprint, bucket);
    }
    if (byFingerprint.size <= 1) {
      return [];
    }
    const representativeTraces = Array.from(byFingerprint.values()).map((bucket) => shortestTrace(bucket));
    const stateIds = representativeTraces.map((trace) => trace.finalStateId);
    return [
      this.violation(invariant, representativeTraces, stateIds, {
        distinctEndpointStates: stateIds,
        endpointFingerprints: Array.from(byFingerprint.keys())
      })
    ];
  }

  private traceFinalStateMatches(trace: TraceRecord, matcher: StateMatcher): boolean {
    const state = this.statesById.get(trace.finalStateId);
    return state ? matchesState(state, matcher) : false;
  }

  private violation(
    invariant: RelationalInvariant,
    traces: TraceRecord[],
    stateIds: string[],
    evidence: Record<string, unknown>
  ): Violation {
    const replaySteps = traces.flatMap((trace) =>
      trace.steps.map((step, index) => `${index + 1}. ${step.profileName} -> ${step.action.label} (${step.action.selector})`)
    );
    return {
      id: `v_${shortHash(`${this.subject.id}|${invariant.id}|${traces.map((trace) => trace.id).join("|")}|${stateIds.join("|")}`)}`,
      subjectId: this.subject.id,
      invariantId: invariant.id,
      invariantType: invariant.type,
      severity: invariant.severity ?? "high",
      title: invariant.description,
      description: describeViolation(invariant, traces),
      traceIds: traces.map((trace) => trace.id),
      stateIds,
      evidence,
      replaySteps
    };
  }
}

function hasAnySelector(trace: TraceRecord, selectors: string[]): boolean {
  return trace.steps.some((step) => selectors.includes(step.action.selector));
}

function shortestTrace(traces: TraceRecord[]): TraceRecord {
  return [...traces].sort((left, right) => left.steps.length - right.steps.length || left.id.localeCompare(right.id))[0]!;
}

function describeViolation(invariant: RelationalInvariant, traces: TraceRecord[]): string {
  if (invariant.type === "auth-precondition") {
    return "A restricted state was reachable without the required authentication or authorization action.";
  }
  if (invariant.type === "validation-blocking") {
    return "An invalid input profile reached a state that should require valid input first.";
  }
  if (invariant.type === "action-forbidden-state") {
    return "A forbidden state was observed after an action that should prevent it.";
  }
  if (invariant.type === "forbidden-transition") {
    return "The inferred graph contains a transition that the workflow contract forbids.";
  }
  return `Equivalent workflow endpoints diverged across ${traces.length} representative paths.`;
}
