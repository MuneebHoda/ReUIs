import path from "node:path";
import { escapeHtml, formatSeconds, titleCase } from "./format.js";
import { representativeCounterexamples } from "./exporters.js";
import type { ReportModel } from "./model.js";
import type { CounterexampleSummary, FaultCoverage, SubjectSummary } from "../types.js";

export function renderHtmlReport(model: ReportModel, artifactsDir: string): string {
  const metrics = model.assignmentMetrics;
  const byApp = groupByApp(model.summaries);
  const counterexamples = representativeCounterexamples(model);
  const reportDir = path.resolve(artifactsDir, "report");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RelUI Report</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #18202f;
      --muted: #5f6f85;
      --line: #d8e0ea;
      --panel: #ffffff;
      --page: #f3f6fa;
      --navy: #16243a;
      --teal: #0f766e;
      --cyan: #0369a1;
      --amber: #b54708;
      --red: #b42318;
      --green: #027a48;
      --soft-teal: #ecfdf3;
      --soft-cyan: #eff8ff;
      --soft-amber: #fffaeb;
      --soft-red: #fef3f2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--page);
      color: var(--ink);
      font: 14px/1.5 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      background: var(--navy);
      color: #ffffff;
      padding: 30px 38px 34px;
      border-bottom: 5px solid var(--teal);
    }
    header h1 { margin: 0; font-size: 31px; letter-spacing: 0; }
    header p { max-width: 840px; margin: 8px 0 0; color: #cfdae8; }
    main { max-width: 1280px; margin: 0 auto; padding: 26px; }
    h2 { margin: 0 0 14px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 16px; letter-spacing: 0; }
    p { color: var(--muted); }
    table { width: 100%; border-collapse: collapse; min-width: 860px; }
    th, td { padding: 9px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
    th { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    pre {
      margin: 10px 0 0;
      padding: 12px;
      overflow: auto;
      background: #101828;
      color: #edf2f7;
      border-radius: 6px;
      font-size: 12px;
    }
    .section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 18px;
      margin-top: 18px;
      overflow: auto;
      box-shadow: 0 1px 2px rgb(16 24 40 / 0.04);
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .metric {
      background: #ffffff;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 16px;
      min-height: 92px;
    }
    .metric strong { display: block; font-size: 27px; line-height: 1.1; }
    .metric span { display: block; margin-top: 6px; color: var(--muted); }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      white-space: nowrap;
    }
    .ok { color: var(--green); background: var(--soft-teal); }
    .miss { color: var(--red); background: var(--soft-red); }
    .neutral { color: var(--muted); background: #eef2f6; }
    .warn { color: var(--amber); background: var(--soft-amber); }
    .info { color: var(--cyan); background: var(--soft-cyan); }
    .critical, .high { color: var(--red); background: var(--soft-red); }
    .medium { color: var(--amber); background: var(--soft-amber); }
    .figure-grid, .app-grid, .fault-grid, .counterexample-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 12px;
    }
    .figure, .fault-card, .counterexample, .app-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fbfcfe;
      padding: 14px;
    }
    .pipeline {
      display: grid;
      grid-template-columns: repeat(5, minmax(130px, 1fr));
      gap: 8px;
      align-items: stretch;
    }
    .pipe-step {
      border: 1px solid #9bd0c7;
      background: #f0fdfa;
      border-radius: 8px;
      padding: 12px;
      min-height: 72px;
      font-weight: 700;
    }
    .pipe-step span { display: block; margin-top: 4px; color: var(--muted); font-weight: 500; font-size: 12px; }
    .bars { display: grid; gap: 10px; }
    .bar-row { display: grid; grid-template-columns: 110px 1fr 52px; gap: 10px; align-items: center; }
    .bar-shell { height: 12px; background: #e8edf4; border-radius: 999px; overflow: hidden; }
    .bar-fill { height: 100%; background: var(--teal); border-radius: 999px; }
    .bar-fill.alt { background: var(--cyan); }
    .bar-fill.warn { background: var(--amber); }
    .fault-card h3, .counterexample h3 { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .fault-meta { color: var(--muted); margin: 6px 0 10px; }
    .mini-table { display: grid; grid-template-columns: 128px 1fr; gap: 6px 10px; font-size: 13px; }
    .mini-table div:nth-child(odd) { color: var(--muted); }
    .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 10px; }
    .shot img { width: 100%; border: 1px solid var(--line); border-radius: 6px; background: white; }
    .shot span { display: block; margin-top: 4px; color: var(--muted); font-size: 12px; }
    .diff { display: grid; gap: 5px; margin-top: 10px; }
    .diff div { padding: 7px 9px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .diff .minus { background: var(--soft-red); color: var(--red); }
    .diff .plus { background: var(--soft-teal); color: var(--green); }
    .diff .note { background: #eef2f6; color: var(--muted); }
    .graph-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
    .edge { color: var(--muted); font-size: 12px; margin: 3px 0; }
    .summary-note { margin: 0 0 14px; color: var(--muted); }
    @media (max-width: 920px) {
      .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .pipeline { grid-template-columns: 1fr; }
      main { padding: 18px; }
    }
  </style>
</head>
<body>
  <header>
    <h1>RelUI Behavioral Consistency Report</h1>
    <p>RelUI explores Web UI interaction paths, infers canonical state-transition graphs, and checks relational invariants that structural and visual tests often miss.</p>
  </header>
  <main>
    <section class="metric-grid" aria-label="Assignment metrics">
      ${metric("Apps Tested", metrics.appsTested, metrics.appNames.map(titleCase).join(", "))}
      ${metric("Faults Injected", metrics.faultsInjected, `${metrics.faultyVariants} faulty variants`)}
      ${metric("States Discovered", metrics.statesDiscovered, `${metrics.transitionsDiscovered} transitions`)}
      ${metric("Bugs Detected", `${metrics.bugsDetected}/${metrics.faultsInjected}`, `${metrics.falsePositives} clean false positives`)}
      ${metric("Traces Explored", metrics.tracesExplored, "Replayable browser traces")}
      ${metric("Relational Violations", metrics.relationalViolations, "Counterexample instances")}
      ${metric("Runtime", `${formatSeconds(metrics.runtimeMs)}s`, "End-to-end exploration time")}
      ${metric("Baseline Hits", metrics.structuralDetections + metrics.visualDetections, `${metrics.structuralDetections} structural, ${metrics.visualDetections} visual`)}
    </section>

    <section class="section">
      <h2>Figure 1. RelUI Pipeline</h2>
      <div class="pipeline">
        ${pipelineStep("Explore", "Playwright collects event traces")}
        ${pipelineStep("Canonicalize", "DOM, URL, widgets, screenshots")}
        ${pipelineStep("Infer Graph", "States and labeled transitions")}
        ${pipelineStep("Check Relations", "Auth, validation, equivalence")}
        ${pipelineStep("Report", "Tables, figures, counterexamples")}
      </div>
    </section>

    <section class="section">
      <h2>Figure 2. App and Fault Matrix</h2>
      <p class="summary-note">Each card groups clean and faulty variants by benchmark app. Detection status is based on expected fault-to-oracle mappings in the config.</p>
      <div class="app-grid">
        ${Array.from(byApp.entries()).map(([app, summaries]) => appPanel(model, app, summaries)).join("")}
      </div>
    </section>

    <section class="section">
      <h2>Figure 3. RelUI vs Baselines</h2>
      <div class="figure-grid">
        ${detectionBars(model)}
        ${modelSizeBars(byApp)}
        ${runtimeBars(byApp)}
      </div>
    </section>

    <section class="section">
      <h2>Subject Results</h2>
      ${subjectTable(model)}
    </section>

    <section class="section">
      <h2>Fault Coverage</h2>
      <div class="fault-grid">
        ${model.faultCoverage.map((fault) => faultCard(fault)).join("")}
      </div>
    </section>

    <section class="section">
      <h2>Representative Counterexamples</h2>
      <div class="counterexample-grid">
        ${counterexamples.map((counterexample) => counterexampleCard(counterexample, reportDir)).join("")}
      </div>
    </section>

    <section class="section">
      <h2>State Graph Sketches</h2>
      <div class="graph-list">
        ${model.summaries.map((summary) => graphCard(model, summary)).join("")}
      </div>
    </section>
  </main>
</body>
</html>`;
}

function metric(label: string, value: string | number, note: string): string {
  return `<div class="metric"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span><span>${escapeHtml(note)}</span></div>`;
}

function pipelineStep(title: string, detail: string): string {
  return `<div class="pipe-step">${escapeHtml(title)}<span>${escapeHtml(detail)}</span></div>`;
}

function appPanel(model: ReportModel, app: string, summaries: SubjectSummary[]): string {
  const faults = model.faultCoverage.filter((fault) => fault.app === app);
  const detected = faults.filter((fault) => fault.detected).length;
  return `<article class="app-card">
    <h3>${escapeHtml(titleCase(app))}</h3>
    <div class="mini-table">
      <div>Variants</div><div>${summaries.length}</div>
      <div>Faults</div><div>${faults.length}</div>
      <div>Detected</div><div>${detected}/${faults.length}</div>
      <div>States</div><div>${summaries.reduce((total, summary) => total + summary.states, 0)}</div>
      <div>Transitions</div><div>${summaries.reduce((total, summary) => total + summary.edges, 0)}</div>
      <div>Runtime</div><div>${formatSeconds(summaries.reduce((total, summary) => total + summary.durationMs, 0))}s</div>
    </div>
    <p>${faults.map((fault) => `<span class="badge ${fault.detected ? "ok" : "miss"}">${escapeHtml(fault.faultId)}</span>`).join(" ")}</p>
  </article>`;
}

function detectionBars(model: ReportModel): string {
  const relui = model.assignmentMetrics.bugsDetected;
  const structural = model.faultCoverage.filter((fault) => fault.baselineKinds.includes("structural")).length;
  const visual = model.faultCoverage.filter((fault) => fault.baselineKinds.includes("visual")).length;
  const total = Math.max(model.assignmentMetrics.faultsInjected, 1);
  return `<article class="figure">
    <h3>Detected Faults</h3>
    <div class="bars">
      ${bar("RelUI", relui, total)}
      ${bar("Structural", structural, total, "alt")}
      ${bar("Visual", visual, total, "warn")}
    </div>
  </article>`;
}

function modelSizeBars(byApp: Map<string, SubjectSummary[]>): string {
  const rows = Array.from(byApp.entries()).map(([app, summaries]) => ({
    label: titleCase(app),
    value: summaries.reduce((total, summary) => total + summary.states + summary.edges, 0)
  }));
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `<article class="figure">
    <h3>States + Transitions</h3>
    <div class="bars">${rows.map((row) => bar(row.label, row.value, max, "alt")).join("")}</div>
  </article>`;
}

function runtimeBars(byApp: Map<string, SubjectSummary[]>): string {
  const rows = Array.from(byApp.entries()).map(([app, summaries]) => ({
    label: titleCase(app),
    value: Number(formatSeconds(summaries.reduce((total, summary) => total + summary.durationMs, 0)))
  }));
  const max = Math.max(...rows.map((row) => row.value), 1);
  return `<article class="figure">
    <h3>Runtime by App</h3>
    <div class="bars">${rows.map((row) => bar(row.label, row.value, max)).join("")}</div>
  </article>`;
}

function bar(label: string, value: number, max: number, kind = ""): string {
  const width = Math.max(3, Math.round((value / max) * 100));
  return `<div class="bar-row"><span>${escapeHtml(label)}</span><div class="bar-shell"><div class="bar-fill ${kind}" style="width:${width}%"></div></div><strong>${escapeHtml(String(value))}</strong></div>`;
}

function subjectTable(model: ReportModel): string {
  return `<table>
    <thead><tr><th>Subject</th><th>App</th><th>Variant</th><th>Faults</th><th>RelUI Violations</th><th>Structural</th><th>Visual</th><th>States</th><th>Transitions</th><th>Traces</th><th>Runtime</th></tr></thead>
    <tbody>
      ${model.summaries
        .map(
          (summary) => `<tr>
            <td>${escapeHtml(summary.subjectId)}</td>
            <td>${escapeHtml(titleCase(summary.app))}</td>
            <td>${escapeHtml(summary.variant)}</td>
            <td>${summary.expectedFaults}</td>
            <td>${summary.relationalViolations}</td>
            <td>${yesNo(summary.structuralDetected)}</td>
            <td>${yesNo(summary.visualDetected)}</td>
            <td>${summary.states}</td>
            <td>${summary.edges}</td>
            <td>${summary.traces}</td>
            <td>${formatSeconds(summary.durationMs)}s</td>
          </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function faultCard(fault: FaultCoverage): string {
  return `<article class="fault-card" id="${escapeHtml(fault.faultId)}">
    <h3>${escapeHtml(fault.faultId)} ${statusBadge(fault.detected)}</h3>
    <p class="fault-meta">${escapeHtml(titleCase(fault.app))} / ${escapeHtml(fault.variant)}</p>
    <p>${escapeHtml(fault.title)}</p>
    <div class="mini-table">
      <div>Expected Oracle</div><div>${escapeHtml(fault.expectedInvariantIds.join(", "))}</div>
      <div>Detected By</div><div>${escapeHtml(fault.detectingInvariantIds.join(", ") || "none")}</div>
      <div>Baseline</div><div>${escapeHtml(fault.baselineKinds.join(", ") || "missed")}</div>
      <div>Counterexample</div><div>${fault.counterexampleId ? `<a href="#${escapeHtml(fault.counterexampleId)}">${escapeHtml(fault.counterexampleId)}</a>` : "none"}</div>
    </div>
  </article>`;
}

function counterexampleCard(counterexample: CounterexampleSummary, reportDir: string): string {
  return `<article class="counterexample" id="${escapeHtml(counterexample.id)}">
    <h3>${escapeHtml(counterexample.faultId ?? counterexample.id)} <span class="badge ${counterexample.severity}">${escapeHtml(counterexample.severity)}</span></h3>
    <p class="fault-meta">${escapeHtml(counterexample.subjectId)} · ${escapeHtml(counterexample.invariantId)}</p>
    <p>${escapeHtml(counterexample.description)}</p>
    <div class="mini-table">
      <div>Start URL</div><div>${escapeHtml(counterexample.startUrl ?? "n/a")}</div>
      <div>End URL</div><div>${escapeHtml(counterexample.endUrl ?? "n/a")}</div>
      <div>Trace IDs</div><div>${escapeHtml(counterexample.traceIds.join(", "))}</div>
    </div>
    <pre>${escapeHtml(counterexample.replaySteps.join("\n") || "Initial state")}</pre>
    <div class="diff">${counterexample.textDiff.map(diffLine).join("")}</div>
    <div class="shots">${counterexample.screenshotPaths.map((shot, index) => shotHtml(shot, index, reportDir)).join("")}</div>
  </article>`;
}

function graphCard(model: ReportModel, summary: SubjectSummary): string {
  const graph = model.graphs.get(summary.subjectId)!;
  return `<article class="figure">
    <h3>${escapeHtml(summary.subjectId)}</h3>
    <p>${graph.stats.states} states, ${graph.stats.edges} transitions, ${graph.stats.traces} traces</p>
    ${graph.edges
      .slice(0, 8)
      .map((edge) => `<div class="edge">${escapeHtml(edge.from)} -> ${escapeHtml(edge.to)} via ${escapeHtml(edge.label)} [${escapeHtml(edge.profileName)}]</div>`)
      .join("")}
  </article>`;
}

function shotHtml(shot: string, index: number, reportDir: string): string {
  const src = path.relative(reportDir, path.resolve(shot)).replaceAll(path.sep, "/");
  return `<div class="shot"><img src="${escapeHtml(src)}" alt="Counterexample screenshot ${index + 1}" /><span>${index === 0 ? "Start state" : "Observed state"}</span></div>`;
}

function diffLine(line: string): string {
  const className = line.startsWith("- ") ? "minus" : line.startsWith("+ ") ? "plus" : "note";
  return `<div class="${className}">${escapeHtml(line)}</div>`;
}

function yesNo(value: boolean): string {
  return `<span class="badge ${value ? "ok" : "neutral"}">${value ? "yes" : "no"}</span>`;
}

function statusBadge(value: boolean): string {
  return `<span class="badge ${value ? "ok" : "miss"}">${value ? "detected" : "missed"}</span>`;
}

function groupByApp(summaries: SubjectSummary[]): Map<string, SubjectSummary[]> {
  const grouped = new Map<string, SubjectSummary[]>();
  for (const summary of summaries) {
    const appSummaries = grouped.get(summary.app) ?? [];
    appSummaries.push(summary);
    grouped.set(summary.app, appSummaries);
  }
  return grouped;
}
