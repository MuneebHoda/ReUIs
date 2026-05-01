import { describe, expect, it } from "vitest";
import { checkSubject } from "../src/invariants.js";
import type { StateGraph, SubjectConfig } from "../src/types.js";

describe("relational invariant checker", () => {
  it("flags protected states reached without required actions", async () => {
    const subject: SubjectConfig = {
      id: "auth-test",
      title: "Auth Test",
      app: "auth",
      variant: "fault",
      url: "http://example.test",
      maxDepth: 1,
      inputProfiles: [{ name: "valid", values: {} }],
      invariants: [
        {
          id: "requires-login",
          type: "auth-precondition",
          description: "Dashboard requires login",
          target: { textIncludes: "Protected dashboard loaded" },
          requiredActionSelectors: ['[data-testid="login"]']
        }
      ]
    };
    const graph = graphWithTrace("Protected dashboard loaded.", []);
    const violations = await checkSubject(subject, graph, "artifacts-test");
    expect(violations).toHaveLength(1);
    expect(violations[0]!.invariantId).toBe("requires-login");
  });

  it("flags divergent equivalent endpoint states", async () => {
    const subject: SubjectConfig = {
      id: "settings-test",
      title: "Settings Test",
      app: "settings",
      variant: "fault",
      url: "http://example.test",
      maxDepth: 1,
      inputProfiles: [{ name: "valid", values: {} }],
      invariants: [
        {
          id: "save-equivalence",
          type: "path-equivalence",
          description: "Save paths converge",
          endpoint: { textIncludes: "Settings Saved" },
          candidateActionSelectors: ['[data-testid="save"]', '[data-testid="quick"]'],
          profiles: ["valid"]
        }
      ]
    };
    const graph: StateGraph = {
      subjectId: "settings-test",
      generatedAt: new Date(0).toISOString(),
      durationMs: 1,
      nodes: [
        state("s0", "Settings", "root"),
        state("s1", "Settings Saved Display name: Taylor", "fp1"),
        state("s2", "Settings Saved Display name: Default User", "fp2")
      ],
      edges: [],
      traces: [
        {
          id: "t1",
          subjectId: "settings-test",
          signature: "valid:[data-testid=\"save\"]",
          steps: [{ profileName: "valid", fills: [], action: { selector: '[data-testid="save"]', label: "Save", tag: "button", isFormAction: true } }],
          stateIds: ["s0", "s1"],
          finalStateId: "s1"
        },
        {
          id: "t2",
          subjectId: "settings-test",
          signature: "valid:[data-testid=\"quick\"]",
          steps: [{ profileName: "valid", fills: [], action: { selector: '[data-testid="quick"]', label: "Quick", tag: "button", isFormAction: true } }],
          stateIds: ["s0", "s2"],
          finalStateId: "s2"
        }
      ],
      stats: { states: 3, edges: 0, traces: 2, maxDepth: 1, exploredActions: 2 }
    };
    const violations = await checkSubject(subject, graph, "artifacts-test");
    expect(violations).toHaveLength(1);
    expect(violations[0]!.invariantType).toBe("path-equivalence");
  });
});

function graphWithTrace(finalText: string, selectors: string[]): StateGraph {
  const steps = selectors.map((selector) => ({
    profileName: "valid",
    fills: [],
    action: { selector, label: selector, tag: "button", isFormAction: true }
  }));
  return {
    subjectId: "auth-test",
    generatedAt: new Date(0).toISOString(),
    durationMs: 1,
    nodes: [state("s0", "Home", "home"), state("s1", finalText, "final")],
    edges: [],
    traces: [
      {
        id: "t1",
        subjectId: "auth-test",
        signature: selectors.join(" -> "),
        steps,
        stateIds: ["s0", "s1"],
        finalStateId: "s1"
      }
    ],
    stats: { states: 2, edges: 0, traces: 1, maxDepth: 1, exploredActions: 1 }
  };
}

function state(id: string, text: string, fingerprint: string) {
  return {
    id,
    url: "http://example.test",
    normalizedUrl: "/",
    title: "Test",
    text,
    canonicalText: text.toLowerCase(),
    semanticFingerprint: fingerprint,
    controlSignature: "",
    controls: []
  };
}
