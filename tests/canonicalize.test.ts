import { describe, expect, it } from "vitest";
import { matchesState, normalizeText, normalizeUrl } from "../src/canonicalize.js";
import type { StateSnapshot } from "../src/types.js";

describe("canonicalization helpers", () => {
  it("normalizes URLs without origin noise", () => {
    expect(normalizeUrl("http://127.0.0.1:4173/auth/clean/dashboard?b=2&a=1")).toBe("/auth/clean/dashboard?b=2&a=1");
    expect(normalizeUrl("http://127.0.0.1:4173/auth/clean/")).toBe("/auth/clean");
  });

  it("normalizes volatile text", () => {
    expect(normalizeText("Saved 12:03:44   ABCDEF123456")).toBe("saved <time> <hash>");
  });

  it("matches state predicates", () => {
    const state: StateSnapshot = {
      id: "s1",
      url: "http://example.test/dashboard",
      normalizedUrl: "/dashboard",
      title: "Dashboard",
      text: "Protected dashboard loaded.",
      canonicalText: "protected dashboard loaded.",
      semanticFingerprint: "abc",
      controlSignature: "button:logout",
      controls: [{ selector: '[data-testid="logout"]', label: "Logout", tag: "button", role: "" }]
    };

    expect(matchesState(state, { urlIncludes: "/dashboard", textIncludes: "protected dashboard" })).toBe(true);
    expect(matchesState(state, { textExcludes: "protected" })).toBe(false);
  });
});
