import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { snapshotPage } from "./canonicalize.js";
import { ensureDir, writeJson } from "./util/fs.js";
import { shortHash } from "./util/hash.js";
import type {
  DiscoveredAction,
  FillRecord,
  GraphEdge,
  InputProfile,
  StateGraph,
  StateSnapshot,
  SubjectConfig,
  TraceRecord,
  TraceStep
} from "./types.js";

export interface ExploreOptions {
  artifactsDir: string;
  headless?: boolean;
  viewport?: {
    width: number;
    height: number;
  };
}

interface QueueItem {
  steps: TraceStep[];
}

interface ReplayResult {
  trace: TraceRecord;
  states: StateSnapshot[];
}

export async function exploreSubject(subject: SubjectConfig, options: ExploreOptions): Promise<StateGraph> {
  const started = Date.now();
  const subjectDir = path.join(options.artifactsDir, "subjects", subject.id);
  const screenshotDir = path.join(subjectDir, "screenshots");
  await ensureDir(screenshotDir);

  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
    deviceScaleFactor: 1
  });
  await context.addInitScript("window.__name = (fn) => fn;");
  const page = await context.newPage();
  const nodes = new Map<string, StateSnapshot>();
  const edges = new Map<string, GraphEdge>();
  const traces = new Map<string, TraceRecord>();
  const queue: QueueItem[] = [{ steps: [] }, ...seedQueue(subject)];
  const seenSignatures = new Set<string>(queue.map((item) => (item.steps.length === 0 ? "start" : traceSignature(item.steps))));
  let exploredActions = 0;

  try {
    while (queue.length > 0 && traces.size < (subject.maxTraces ?? 80)) {
      const item = queue.shift()!;
      const replay = await replayTrace(page, subject, item.steps, screenshotDir);
      for (const state of replay.states) {
        nodes.set(state.id, state);
      }
      traces.set(replay.trace.id, replay.trace);
      addTraceEdges(edges, replay.trace);
      if (traces.size === 1 || traces.size % 10 === 0) {
        console.log(`  ${subject.id}: ${traces.size} traces, ${nodes.size} states, queue ${queue.length}`);
      }

      if (item.steps.length >= subject.maxDepth) {
        continue;
      }

      await resetPage(page, subject);
      await replaySteps(page, item.steps, subject);
      const actions = (await discoverActions(page)).slice(0, subject.maxActionsPerState ?? 8);
      for (const action of actions) {
        const profiles = action.isFormAction ? subject.inputProfiles : [defaultProfile()];
        for (const profile of profiles) {
          const fills = action.isFormAction ? await plannedFills(page, profile) : [];
          const nextSteps = [...item.steps, { action, profileName: profile.name, fills }];
          const signature = traceSignature(nextSteps);
          if (seenSignatures.has(signature)) {
            continue;
          }
          seenSignatures.add(signature);
          queue.push({ steps: nextSteps });
          exploredActions += 1;
        }
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  const graph: StateGraph = {
    subjectId: subject.id,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    traces: Array.from(traces.values()),
    stats: {
      states: nodes.size,
      edges: edges.size,
      traces: traces.size,
      maxDepth: subject.maxDepth,
      exploredActions
    }
  };
  await writeJson(path.join(subjectDir, "graph.json"), graph);
  return graph;
}

async function replayTrace(
  page: Page,
  subject: SubjectConfig,
  steps: TraceStep[],
  screenshotDir: string
): Promise<ReplayResult> {
  const states: StateSnapshot[] = [];
  await resetPage(page, subject);
  states.push(await snapshotPage(page, { subjectId: subject.id, screenshotDir }));
  for (const step of steps) {
    await executeStep(page, step, subject);
    states.push(await snapshotPage(page, { subjectId: subject.id, screenshotDir }));
  }

  const signature = steps.length === 0 ? "start" : traceSignature(steps);
  return {
    states,
    trace: {
      id: `t_${shortHash(signature)}`,
      subjectId: subject.id,
      signature,
      steps,
      stateIds: states.map((state) => state.id),
      finalStateId: states[states.length - 1]!.id
    }
  };
}

async function resetPage(page: Page, subject: SubjectConfig): Promise<void> {
  await page.goto(subject.url, { waitUntil: "domcontentloaded" });
  await page.evaluate("window.__name = (fn) => fn; localStorage.clear(); sessionStorage.clear();").catch(() => undefined);
  await page.goto(subject.url, { waitUntil: "domcontentloaded" });
  await page.evaluate("window.__name = (fn) => fn").catch(() => undefined);
  await page.waitForTimeout(20);
}

async function replaySteps(page: Page, steps: TraceStep[], subject: SubjectConfig): Promise<void> {
  for (const step of steps) {
    await executeStep(page, step, subject);
  }
}

async function executeStep(page: Page, step: TraceStep, subject: SubjectConfig): Promise<void> {
  const profile = subject.inputProfiles.find((candidate) => candidate.name === step.profileName) ?? defaultProfile();
  const fills = step.fills.length > 0 ? step.fills : await plannedFills(page, profile);
  for (const fill of fills) {
    await applyFill(page, fill);
  }
  const locator = page.locator(step.action.selector).first();
  await locator.click({ timeout: 2_000 }).catch(async () => {
    await page.evaluate((selector) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      element?.click();
    }, step.action.selector);
  });
  await page.waitForTimeout(80);
}

async function applyFill(page: Page, fill: FillRecord): Promise<void> {
  const locator = page.locator(fill.selector).first();
  const value = fill.value;
  const type = await locator.evaluate((element) => (element as HTMLInputElement).type ?? element.tagName.toLowerCase());
  if (type === "checkbox") {
    if (Boolean(value)) {
      await locator.check({ timeout: 1_000 }).catch(() => undefined);
    } else {
      await locator.uncheck({ timeout: 1_000 }).catch(() => undefined);
    }
    return;
  }
  if (type === "select-one") {
    await locator.selectOption(String(value)).catch(() => undefined);
    return;
  }
  await locator.fill(String(value), { timeout: 1_000 }).catch(() => undefined);
}

async function discoverActions(page: Page): Promise<DiscoveredAction[]> {
  const actions = await page.evaluate<DiscoveredAction[]>(() => {
    const isVisible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return !htmlElement.hasAttribute("disabled") && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const stableSelector = (element: Element): string => {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return `[data-testid="${testId}"]`;
      }
      const id = element.getAttribute("id");
      if (id) {
        return `#${CSS.escape(id)}`;
      }
      const name = element.getAttribute("name");
      if (name) {
        return `${element.tagName.toLowerCase()}[name="${name}"]`;
      }
      return element.tagName.toLowerCase();
    };
    const labelFor = (element: Element): string => {
      const aria = element.getAttribute("aria-label");
      const relui = element.getAttribute("data-relui-label");
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      return aria ?? relui ?? text ?? element.getAttribute("data-testid") ?? element.tagName.toLowerCase();
    };
    const selectors = "a[href], button, input[type='submit'], [role='button']";
    return Array.from(document.querySelectorAll(selectors))
      .filter(isVisible)
      .map((element) => {
        const tag = element.tagName.toLowerCase();
        const form = element.closest("form");
        return {
          selector: stableSelector(element),
          label: labelFor(element),
          tag,
          href: element instanceof HTMLAnchorElement ? element.href : undefined,
          isFormAction: Boolean(form) || tag === "input"
        };
      });
  });

  const seen = new Set<string>();
  return actions.filter((action) => {
    if (seen.has(action.selector)) {
      return false;
    }
    seen.add(action.selector);
    return true;
  });
}

async function plannedFills(page: Page, profile: InputProfile): Promise<FillRecord[]> {
  const fields = await page.evaluate<Array<{ selector: string; key: string; type: string }>>(() => {
    const isVisible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return !htmlElement.hasAttribute("disabled") && style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const selectorFor = (element: Element): string => {
      const testId = element.getAttribute("data-testid");
      if (testId) {
        return `[data-testid="${testId}"]`;
      }
      const id = element.getAttribute("id");
      if (id) {
        return `#${CSS.escape(id)}`;
      }
      const name = element.getAttribute("name");
      if (name) {
        return `${element.tagName.toLowerCase()}[name="${name}"]`;
      }
      return element.tagName.toLowerCase();
    };
    return Array.from(document.querySelectorAll("input, textarea, select"))
      .filter(isVisible)
      .map((element) => ({
        selector: selectorFor(element),
        key:
          element.getAttribute("data-testid") ??
          element.getAttribute("name") ??
          element.getAttribute("id") ??
          element.getAttribute("placeholder") ??
          element.tagName.toLowerCase(),
        type: (element as HTMLInputElement).type ?? element.tagName.toLowerCase()
      }));
  });

  return fields.map((field) => ({
    selector: field.selector,
    key: field.key,
    value: valueForField(field.key, field.type, profile)
  }));
}

function valueForField(key: string, type: string, profile: InputProfile): string | number | boolean {
  const normalizedKey = key.toLowerCase();
  const exact = profile.values[key] ?? profile.values[normalizedKey];
  if (exact !== undefined) {
    return exact;
  }
  for (const [candidate, value] of Object.entries(profile.values)) {
    if (normalizedKey.includes(candidate.toLowerCase())) {
      return value;
    }
  }
  if (type === "checkbox") {
    return true;
  }
  if (type === "number") {
    return profile.name === "invalid" ? -1 : 1;
  }
  if (type === "email") {
    return profile.name === "invalid" ? "not-an-email" : "user@example.com";
  }
  if (type === "password") {
    return profile.name === "invalid" ? "wrong" : "password";
  }
  return profile.name === "invalid" ? "" : "relui-value";
}

function addTraceEdges(edges: Map<string, GraphEdge>, trace: TraceRecord): void {
  for (let index = 0; index < trace.steps.length; index += 1) {
    const step = trace.steps[index]!;
    const from = trace.stateIds[index]!;
    const to = trace.stateIds[index + 1]!;
    const edgeId = `e_${shortHash(`${from}|${to}|${step.action.selector}|${step.profileName}`)}`;
    const existing = edges.get(edgeId);
    if (existing) {
      existing.traceIds.push(trace.id);
      continue;
    }
    edges.set(edgeId, {
      id: edgeId,
      from,
      to,
      selector: step.action.selector,
      label: step.action.label,
      profileName: step.profileName,
      traceIds: [trace.id]
    });
  }
}

function traceSignature(steps: TraceStep[]): string {
  return steps.map((step) => `${step.profileName}:${step.action.selector}`).join(" -> ");
}

function defaultProfile(): InputProfile {
  return { name: "default", values: {} };
}

function seedQueue(subject: SubjectConfig): QueueItem[] {
  return (subject.seedTraces ?? []).map((seed) => ({
    steps: seed.steps.map((step) => ({
      action: {
        selector: step.selector,
        label: step.label ?? step.selector,
        tag: "seed",
        isFormAction: step.isFormAction ?? true
      },
      profileName: step.profileName ?? "default",
      fills: []
    }))
  }));
}
