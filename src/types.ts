export type Severity = "low" | "medium" | "high" | "critical";

export interface ReluiConfig {
  artifactsDir: string;
  server?: ServerConfig;
  browser?: BrowserConfig;
  subjects: SubjectConfig[];
}

export interface ServerConfig {
  command: string;
  readyUrl: string;
  startupTimeoutMs?: number;
}

export interface BrowserConfig {
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}

export interface SubjectConfig {
  id: string;
  title: string;
  app: string;
  variant: string;
  url: string;
  cleanSubjectId?: string;
  maxDepth: number;
  maxTraces?: number;
  maxActionsPerState?: number;
  inputProfiles: InputProfile[];
  seedTraces?: SeedTraceConfig[];
  invariants: RelationalInvariant[];
  expectedFaults?: ExpectedFault[];
}

export interface SeedTraceConfig {
  name: string;
  steps: SeedTraceStepConfig[];
}

export interface SeedTraceStepConfig {
  selector: string;
  label?: string;
  profileName?: string;
  isFormAction?: boolean;
}

export interface ExpectedFault {
  id: string;
  title: string;
  invariantIds: string[];
}

export interface InputProfile {
  name: string;
  values: Record<string, string | number | boolean>;
}

export interface DiscoveredAction {
  selector: string;
  label: string;
  tag: string;
  href?: string;
  isFormAction: boolean;
}

export interface FillRecord {
  selector: string;
  key: string;
  value: string | number | boolean;
}

export interface TraceStep {
  action: DiscoveredAction;
  profileName: string;
  fills: FillRecord[];
}

export interface TraceRecord {
  id: string;
  subjectId: string;
  signature: string;
  steps: TraceStep[];
  stateIds: string[];
  finalStateId: string;
}

export interface StateSnapshot {
  id: string;
  url: string;
  normalizedUrl: string;
  title: string;
  text: string;
  canonicalText: string;
  semanticFingerprint: string;
  controlSignature: string;
  controls: ControlSnapshot[];
  screenshotPath?: string;
}

export interface ControlSnapshot {
  selector: string;
  label: string;
  tag: string;
  role: string;
  value?: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  selector: string;
  label: string;
  profileName: string;
  traceIds: string[];
}

export interface StateGraph {
  subjectId: string;
  generatedAt: string;
  durationMs: number;
  nodes: StateSnapshot[];
  edges: GraphEdge[];
  traces: TraceRecord[];
  stats: {
    states: number;
    edges: number;
    traces: number;
    maxDepth: number;
    exploredActions: number;
  };
}

export type RelationalInvariant =
  | AuthPreconditionInvariant
  | ValidationBlockingInvariant
  | ActionForbiddenStateInvariant
  | ForbiddenTransitionInvariant
  | PathEquivalenceInvariant;

export interface BaseInvariant {
  id: string;
  description: string;
  severity?: Severity;
}

export interface AuthPreconditionInvariant extends BaseInvariant {
  type: "auth-precondition";
  target: StateMatcher;
  requiredActionSelectors: string[];
}

export interface ValidationBlockingInvariant extends BaseInvariant {
  type: "validation-blocking";
  invalidProfiles: string[];
  actionSelectors?: string[];
  forbidden: StateMatcher;
}

export interface ActionForbiddenStateInvariant extends BaseInvariant {
  type: "action-forbidden-state";
  actionSelectors: string[];
  forbiddenAfterAction: StateMatcher;
  scope?: "immediate" | "eventual";
}

export interface ForbiddenTransitionInvariant extends BaseInvariant {
  type: "forbidden-transition";
  from: StateMatcher;
  to: StateMatcher;
  actionSelectors?: string[];
}

export interface PathEquivalenceInvariant extends BaseInvariant {
  type: "path-equivalence";
  endpoint: StateMatcher;
  minDistinctPaths?: number;
  candidateActionSelectors?: string[];
  profiles?: string[];
}

export interface StateMatcher {
  urlIncludes?: string;
  urlRegex?: string;
  textIncludes?: string;
  textExcludes?: string;
  titleIncludes?: string;
  controlIncludes?: string;
}

export interface Violation {
  id: string;
  subjectId: string;
  invariantId: string;
  invariantType: RelationalInvariant["type"];
  severity: Severity;
  title: string;
  description: string;
  traceIds: string[];
  stateIds: string[];
  evidence: Record<string, unknown>;
  replaySteps: string[];
}

export interface BaselineResult {
  subjectId: string;
  cleanSubjectId?: string;
  structural: BaselineCheckResult;
  visual: BaselineCheckResult;
}

export interface BaselineCheckResult {
  detected: boolean;
  alerts: BaselineAlert[];
}

export interface BaselineAlert {
  kind: "structural" | "visual";
  message: string;
  traceSignature?: string;
  score?: number;
}

export interface SubjectSummary {
  subjectId: string;
  title: string;
  app: string;
  variant: string;
  expectedFaults: number;
  relationalViolations: number;
  structuralDetected: boolean;
  visualDetected: boolean;
  states: number;
  edges: number;
  traces: number;
  durationMs: number;
}

export interface AssignmentMetrics {
  appsTested: number;
  appNames: string[];
  subjectVariants: number;
  cleanVariants: number;
  faultyVariants: number;
  faultsInjected: number;
  statesDiscovered: number;
  transitionsDiscovered: number;
  tracesExplored: number;
  bugsDetected: number;
  falsePositives: number;
  relationalViolations: number;
  structuralDetections: number;
  visualDetections: number;
  runtimeMs: number;
}

export interface FaultCoverage {
  faultId: string;
  title: string;
  subjectId: string;
  app: string;
  variant: string;
  expectedInvariantIds: string[];
  detected: boolean;
  detectingInvariantIds: string[];
  relationalViolationIds: string[];
  baselineDetected: boolean;
  baselineKinds: Array<"structural" | "visual">;
  counterexampleId?: string;
}

export interface CounterexampleSummary {
  id: string;
  subjectId: string;
  app: string;
  variant: string;
  faultId?: string;
  invariantId: string;
  invariantType: RelationalInvariant["type"];
  severity: Severity;
  title: string;
  description: string;
  traceIds: string[];
  replaySteps: string[];
  startStateId?: string;
  endStateId?: string;
  startUrl?: string;
  endUrl?: string;
  startText?: string;
  endText?: string;
  screenshotPaths: string[];
  textDiff: string[];
}

export interface ReportTable {
  id: string;
  title: string;
  columns: string[];
  rows: Array<Array<string | number | boolean>>;
}
