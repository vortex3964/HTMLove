/**
 * catalog — turn a raw folder snapshot into a list of components.
 *
 * The folder layouts htmlove has to survive are messy by nature:
 *   - pairs like `hi.html` + `hi.css`
 *   - standalone html, possibly styled purely with Tailwind classes
 *   - react sources (`*.tsx`) with their own imports
 *   - `.txt` files with CSS and HTML pasted one after the other
 * so everything here is heuristic and heavily unit-tested.
 */
import type { CatalogResult, Component, RawSnapshot } from "./types";

/* ------------------------------------------------------------------ */
/* path helpers                                                        */
/* ------------------------------------------------------------------ */

export function dirOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? "" : rel.slice(0, i);
}

export function baseOf(rel: string): string {
  const i = rel.lastIndexOf("/");
  return i === -1 ? rel : rel.slice(i + 1);
}

export function stemOf(rel: string): string {
  const base = baseOf(rel);
  const i = base.lastIndexOf(".");
  return i === -1 ? base : base.slice(0, i);
}

export function extOf(rel: string): string {
  const base = baseOf(rel);
  const i = base.lastIndexOf(".");
  return i === -1 ? "" : base.slice(i + 1).toLowerCase();
}

/* ------------------------------------------------------------------ */
/* .txt splitting                                                      */
/* ------------------------------------------------------------------ */

export interface TxtParts {
  css: string;
  html: string;
}

/**
 * A `.txt` snippet usually contains CSS first then markup, but the order
 * is not guaranteed and the file may be CSS-only. Split at the first
 * character that cannot be part of CSS — a `<tag` or an HTML comment.
 */
export function splitTxtSource(source: string): TxtParts {
  const match = /<(?:[a-zA-Z!/])/.exec(source);
  if (!match || match.index === undefined) {
    return { css: source, html: "" };
  }
  const before = source.slice(0, match.index);
  const from = source.slice(match.index);
  const beforeLooksLikeCss = before.includes("{") && before.includes("}");
  if (beforeLooksLikeCss) return { css: before, html: from };
  // Markup came first (or there was no CSS at all).
  return { css: "", html: source };
}

/* ------------------------------------------------------------------ */
/* attribution                                                         */
/* ------------------------------------------------------------------ */

/**
 * Most snippets carry a credit comment like
 *   `<!-- From Uiverse.io by nazar-gavrylyk -->`
 * Extract it for display in the gallery.
 */
export function findAttribution(sources: string[]): string | undefined {
  for (const source of sources) {
    if (!source) continue;
    const match = /From\s+([A-Za-z0-9][A-Za-z0-9.-]*\.[A-Za-z]{2,})\s+by\s+([^\n\r*/<>]{1,40}?)\s*(?:\*\/|-->|$|\r|\n)/i.exec(
      source,
    );
    if (match) {
      const who = match[2].replace(/[\s*/>-]+$/, "").trim();
      if (who) return `${match[1]} · ${who}`;
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* tailwind detection                                                  */
/* ------------------------------------------------------------------ */

const TAILWIND_PATTERNS: RegExp[] = [
  /\b(?:flex|grid|inline-flex|hidden|absolute|relative|sticky|fixed|block)\b/,
  /\b[mp][xytrbl]?-(?:\d+(?:\.\d+)?|\[[^\]]+\])\b/,
  /\bgap-(?:\d+(?:\.\d+)?|\[[^\]]+\])\b/,
  /\b(?:w|h|min-w|min-h|max-w|max-h)-[\w./[\]%()-]+/,
  /\b(?:bg|text|border|from|to|via)-(?:white|black|transparent|[\w]+-\d{2,3}|[\w]+\[\d+\]|\[[^\]]+\])\b/,
  /\b(?:bg|text|border|ring)-\w+\/\d+\b/,
  /\b(?:text|font)-(?:xs|sm|base|lg|xl|\d?xl|medium|semibold|bold|thin|light|black)\b/,
  /\brounded(?:-[a-z0-9[\]]+)?\b/,
  /\bshadow(?:-[a-z0-9[\]]+)?\b/,
  /\bopacity-\d+\b/,
  /\b(?:items|justify|content|self)-[\w-]+/,
  /(?:^|["'\s])(?:hover|focus|active|group-hover|dark|sm|md|lg|xl|2xl):[a-z[]/,
  /\bgroup-hover\/[\w-]+:/,
  /\banimate-[\w[]/,
  /\btransition(?:-[\w-]+)?\b/,
  /\b[0-5]?0*(?:backdrop|blur|filter)-[\w./[\]-]+/,
  /\[--[\w-]+:/,
];

/**
 * Decide whether markup/JSX leans on Tailwind classes. Needs a handful of
 * distinct utility patterns so ordinary `class="card"` markup stays clean.
 */
export function detectTailwind(source: string): boolean {
  if (!source) return false;
  if (/@tailwind|@apply/.test(source)) return true;
  let hits = 0;
  for (const pattern of TAILWIND_PATTERNS) {
    if (pattern.test(source)) {
      hits++;
      if (hits >= 4) return true;
    }
  }
  return hits >= 4;
}

/* ------------------------------------------------------------------ */
/* catalog building                                                    */
/* ------------------------------------------------------------------ */

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp"]);
const SUPPORT_EXTENSIONS = new Set(["ts", "js", "mjs", "cjs", "md"]);

export function buildCatalog(snapshot: RawSnapshot): CatalogResult {
  const { files, assets } = snapshot;
  const components: Component[] = [];
  const configFiles: string[] = [];
  const supportFiles: string[] = [];

  /* group all files by the folder they live in */
  const byDir = new Map<string, string[]>();
  for (const rel of Object.keys(files).sort()) {
    const dir = dirOf(rel);
    const list = byDir.get(dir);
    if (list) list.push(rel);
    else byDir.set(dir, [rel]);
  }

  for (const [dir, rels] of byDir) {
    const withExt = (exts: string[]) =>
      rels.filter((rel) => exts.includes(extOf(rel)));

    const htmls = withExt(["html", "htm"]);
    const reactSources = withExt(["tsx", "jsx"]);
    const txts = withExt(["txt"]);

    for (const rel of withExt([...SUPPORT_EXTENSIONS])) supportFiles.push(rel);
    for (const rel of rels.filter((r) => extOf(r) === "json")) {
      if (baseOf(rel) === "playground.deps.json") configFiles.push(rel);
      else supportFiles.push(rel);
    }

    /* screenshots: images sitting next to the component */
    const dirImages = Object.keys(assets)
      .filter((a) => dirOf(a) === dir && IMAGE_EXTENSIONS.has(extOf(a)))
      .sort((a, b) => a.localeCompare(b));

    interface Candidate {
      kind: Component["kind"];
      primary: string;
      htmlPath?: string;
      cssPath?: string;
      txtPath?: string;
      tsxPath?: string;
    }
    const candidates: Candidate[] = [];

    for (const rel of htmls) {
      const stem = stemOf(rel);
      const cssRel = `${dir ? dir + "/" : ""}${stem}.css`;
      candidates.push({
        kind: "html",
        primary: rel,
        htmlPath: rel,
        cssPath: files[cssRel] !== undefined ? cssRel : undefined,
      });
    }
    for (const rel of reactSources) {
      candidates.push({ kind: "tsx", primary: rel, tsxPath: rel });
    }
    for (const rel of txts) {
      candidates.push({ kind: "txt", primary: rel, txtPath: rel });
    }

    if (candidates.length === 0) continue;

    for (const cand of candidates) {
      const stem = stemOf(cand.primary);
      const dirName = dir ? baseOf(dir) : "";
      const name =
        candidates.length === 1
          ? dirName || stem
          : candidates.some((other) => other !== cand && stemOf(other.primary) === stem)
            ? `${stem} (${cand.kind})`
            : stem;

      /* content used for the remaining heuristics */
      const htmlText = cand.htmlPath ? files[cand.htmlPath] : "";
      const cssText = cand.cssPath ? files[cand.cssPath] : "";
      const txtText = cand.txtPath ? files[cand.txtPath] : "";
      const tsxText = cand.tsxPath ? files[cand.tsxPath] : "";
      const txtParts = txtText ? splitTxtSource(txtText) : undefined;

      const usesTailwind =
        detectTailwind(htmlText) ||
        detectTailwind(txtText) ||
        detectTailwind(tsxText) ||
        /@tailwind|@apply/.test(cssText);

      const cssOnly =
        (cand.kind === "txt" && !!txtParts && txtParts.html.trim() === "") ||
        (cand.kind === "html" && htmlText.trim() === "");

      const screenshots = dirImages
        .slice()
        .sort((a, b) => {
          const score = (p: string) =>
            (stemOf(p).toLowerCase().includes(stem.toLowerCase()) ? 2 : 0) +
            (dirName && baseOf(p).toLowerCase().includes(dirName.toLowerCase()) ? 1 : 0);
          return score(b) - score(a) || a.localeCompare(b);
        })
        .slice(0, 6);

      components.push({
        id: cand.primary,
        name,
        dir,
        kind: cand.kind,
        htmlPath: cand.htmlPath,
        cssPath: cand.cssPath,
        tsxPath: cand.tsxPath,
        txtPath: cand.txtPath,
        attribution: findAttribution([htmlText, txtText, cssText, tsxText]),
        usesTailwind,
        cssOnly,
        screenshots,
      });
    }
  }

  components.sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  configFiles.sort();
  supportFiles.sort();
  return { components, configFiles, supportFiles };
}
