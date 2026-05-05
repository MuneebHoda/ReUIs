import { describe, expect, it } from "vitest";
import { escapeLatex } from "../src/report/format.js";
import { buildLatexTables } from "../src/report/exporters.js";
import { buildReportModel } from "../src/report/model.js";
import type { BaselineResult, StateGraph, SubjectConfig, Violation } from "../src/types.js";

describe("report model", () => {
  it("aggregates assignment metrics and clean false positives", () => {
    const model = sampleModel();

    expect(model.assignmentMetrics.appsTested).toBe(2);
    expect(model.assignmentMetrics.faultsInjected).toBe(1);
    expect(model.assignmentMetrics.bugsDetected).toBe(1);
    expect(model.assignmentMetrics.falsePositives).toBe(0);
    expect(model.assignmentMetrics.statesDiscovered).toBe(6);
    expect(model.assignmentMetrics.transitionsDiscovered).toBe(3);
  });

  it("classifies fault coverage by expected invariant", () => {
    const model = sampleModel();

    expect(model.faultCoverage).toHaveLength(1);
    expect(model.faultCoverage[0]).toMatchObject({
      faultId: "F-AUTH-1",
      detected: true,
      detectingInvariantIds: ["auth-dashboard-requires-login"],
      baselineKinds: ["structural"]
    });
  });

  it("summarizes counterexamples with replay evidence", () => {
    const model = sampleModel();
    const counterexample = model.counterexamples.find((candidate) => candidate.id === "v1");

    expect(counterexample?.faultId).toBe("F-AUTH-1");
    expect(counterexample?.startUrl).toBe("/");
    expect(counterexample?.endUrl).toBe("/dashboard");
    expect(counterexample?.replaySteps[0]).toContain("Open Dashboard");
    expect(counterexample?.textDiff.join("\n")).toContain("Protected dashboard loaded");
  });

  it("builds app and invariant-family coverage analytics", () => {
    const model = sampleModel();
    const authCoverage = model.appCoverage.find((coverage) => coverage.app === "auth");
    const authPrecondition = model.invariantFamilyCoverage.find((coverage) => coverage.invariantType === "auth-precondition");

    expect(authCoverage).toMatchObject({
      variants: 2,
      injectedFaults: 1,
      detectedFaults: 1,
      uniqueActions: 1,
      maxTraceLength: 1
    });
    expect(authPrecondition).toMatchObject({
      configuredInvariants: 1,
      expectedFaults: 1,
      detectedFaults: 1,
      violationInstances: 1
    });
  });

  it("escapes LaTeX table content", () => {
    expect(escapeLatex("auth_bypass & 100%")).toBe("auth\\_bypass \\& 100\\%");

    const tables = buildLatexTables(sampleModel());
    expect(tables.map((table) => table.id)).toContain("detection_summary");
  });
});

function sampleModel() {
  const subjects: SubjectConfig[] = [
    {
      id: "auth-clean",
      title: "Auth / clean",
      app: "auth",
      variant: "clean",
      url: "http://example.test/auth/clean",
      maxDepth: 1,
      inputProfiles: [{ name: "valid", values: {} }],
      invariants: [],
      expectedFaults: []
    },
    {
      id: "auth-auth-bypass",
      title: "Auth / auth-bypass",
      app: "auth",
      variant: "auth-bypass",
      url: "http://example.test/auth/auth-bypass",
      maxDepth: 1,
      inputProfiles: [{ name: "valid", values: {} }],
      invariants: [
        {
          id: "auth-dashboard-requires-login",
          type: "auth-precondition",
          description: "Dashboard requires login",
          target: { textIncludes: "Protected dashboard loaded" },
          requiredActionSelectors: ['[data-testid="user-login-submit"]']
        }
      ],
      expectedFaults: [
        {
          id: "F-AUTH-1",
          title: "Dashboard bypasses authentication",
          invariantIds: ["auth-dashboard-requires-login"]
        }
      ]
    },
    {
      id: "settings-clean",
      title: "Settings / clean",
      app: "settings",
      variant: "clean",
      url: "http://example.test/settings/clean",
      maxDepth: 1,
      inputProfiles: [{ name: "valid", values: {} }],
      invariants: [],
      expectedFaults: []
    }
  ];

  const graphs = new Map<string, StateGraph>([
    ["auth-clean", graph("auth-clean", "Home", "Login required")],
    ["auth-auth-bypass", graph("auth-auth-bypass", "Home", "Protected dashboard loaded.")],
    ["settings-clean", graph("settings-clean", "Settings", "Settings Saved")]
  ]);

  const violationsBySubject = new Map<string, Violation[]>([
    ["auth-clean", []],
    [
      "auth-auth-bypass",
      [
        {
          id: "v1",
          subjectId: "auth-auth-bypass",
          invariantId: "auth-dashboard-requires-login",
          invariantType: "auth-precondition",
          severity: "critical",
          title: "Dashboard access must be preceded by login",
          description: "A restricted state was reachable without login.",
          traceIds: ["t1"],
          stateIds: ["s0", "s1"],
          evidence: {},
          replaySteps: ['1. default -> Open Dashboard ([data-testid="home-dashboard"])']
        }
      ]
    ],
    ["settings-clean", []]
  ]);

  const baselines: BaselineResult[] = [
    {
      subjectId: "auth-auth-bypass",
      cleanSubjectId: "auth-clean",
      structural: { detected: true, alerts: [{ kind: "structural", message: "Different control signature." }] },
      visual: { detected: false, alerts: [] }
    }
  ];

  return buildReportModel({ subjects, graphs, violationsBySubject, baselines });
}

function graph(subjectId: string, startText: string, endText: string): StateGraph {
  return {
    subjectId,
    generatedAt: new Date(0).toISOString(),
    durationMs: 1000,
    nodes: [
      state("s0", "/", startText),
      state("s1", "/dashboard", endText)
    ],
    edges: [
      {
        id: "e1",
        from: "s0",
        to: "s1",
        selector: '[data-testid="home-dashboard"]',
        label: "Open Dashboard",
        profileName: "default",
        traceIds: ["t1"]
      }
    ],
    traces: [
      {
        id: "t1",
        subjectId,
        signature: 'default:[data-testid="home-dashboard"]',
        steps: [
          {
            profileName: "default",
            fills: [],
            action: {
              selector: '[data-testid="home-dashboard"]',
              label: "Open Dashboard",
              tag: "a",
              isFormAction: false
            }
          }
        ],
        stateIds: ["s0", "s1"],
        finalStateId: "s1"
      }
    ],
    stats: { states: 2, edges: 1, traces: 1, maxDepth: 1, exploredActions: 1 }
  };
}

function state(id: string, normalizedUrl: string, text: string) {
  return {
    id,
    url: `http://example.test${normalizedUrl}`,
    normalizedUrl,
    title: "Test",
    text,
    canonicalText: text.toLowerCase(),
    semanticFingerprint: `${id}-${text}`,
    controlSignature: "",
    controls: [],
    screenshotPath: `artifacts/subjects/test/screenshots/${id}.png`
  };
}
