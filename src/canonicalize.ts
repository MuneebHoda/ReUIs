import path from "node:path";
import { existsSync } from "node:fs";
import type { Page } from "@playwright/test";
import { ensureDir } from "./util/fs.js";
import { sha256, shortHash } from "./util/hash.js";
import type { ControlSnapshot, StateMatcher, StateSnapshot } from "./types.js";

export interface SnapshotOptions {
  subjectId: string;
  screenshotDir: string;
}

interface BrowserSnapshot {
  url: string;
  title: string;
  text: string;
  controls: ControlSnapshot[];
}

export async function snapshotPage(page: Page, options: SnapshotOptions): Promise<StateSnapshot> {
  const raw = await page.evaluate<BrowserSnapshot>(() => {
    const isVisible = (element: Element): boolean => {
      const htmlElement = element as HTMLElement;
      const style = window.getComputedStyle(htmlElement);
      const rect = htmlElement.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
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
      const testId = element.getAttribute("data-testid");
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      return aria ?? relui ?? text ?? testId ?? element.tagName.toLowerCase();
    };

    const controls = Array.from(document.querySelectorAll("a[href], button, input, select, textarea, [role='button']"))
      .filter(isVisible)
      .map((element) => ({
        selector: stableSelector(element),
        label: labelFor(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role") ?? "",
        value:
          element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
            ? element.value
            : undefined
      }));

    return {
      url: window.location.href,
      title: document.title,
      text: (document.body.innerText ?? "").replace(/\s+/g, " ").trim(),
      controls
    };
  });

  const canonicalText = normalizeText(raw.text);
  const normalizedUrl = normalizeUrl(raw.url);
  const controlSignature = raw.controls
    .map((control) => `${control.tag}:${normalizeText(control.label)}:${control.selector}:${normalizeText(control.value ?? "")}`)
    .sort()
    .join("|");
  const semanticFingerprint = sha256(`${normalizedUrl}\n${canonicalText}\n${controlSignature}`);
  const id = `s_${shortHash(semanticFingerprint)}`;
  const screenshotPath = path.join(options.screenshotDir, `${id}.png`);

  await ensureDir(options.screenshotDir);
  if (!existsSync(screenshotPath)) {
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // The state is still useful if a screenshot fails because a page navigated mid-capture.
    }
  }

  return {
    id,
    url: raw.url,
    normalizedUrl,
    title: raw.title,
    text: raw.text,
    canonicalText,
    semanticFingerprint,
    controlSignature,
    controls: raw.controls,
    screenshotPath
  };
}

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  const path = parsed.pathname.replace(/\/+$/, "") || "/";
  const search = parsed.searchParams.toString();
  return search ? `${path}?${search}` : path;
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, "<time>")
    .replace(/\b[0-9a-f]{8,}\b/g, "<hash>")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesState(state: StateSnapshot, matcher: StateMatcher): boolean {
  if (matcher.urlIncludes && !state.normalizedUrl.includes(matcher.urlIncludes)) {
    return false;
  }
  if (matcher.urlRegex && !new RegExp(matcher.urlRegex).test(state.normalizedUrl)) {
    return false;
  }
  if (matcher.textIncludes && !state.text.toLowerCase().includes(matcher.textIncludes.toLowerCase())) {
    return false;
  }
  if (matcher.textExcludes && state.text.toLowerCase().includes(matcher.textExcludes.toLowerCase())) {
    return false;
  }
  if (matcher.titleIncludes && !state.title.toLowerCase().includes(matcher.titleIncludes.toLowerCase())) {
    return false;
  }
  if (
    matcher.controlIncludes &&
    !state.controls.some((control) =>
      `${control.label} ${control.selector}`.toLowerCase().includes(matcher.controlIncludes!.toLowerCase())
    )
  ) {
    return false;
  }
  return true;
}
