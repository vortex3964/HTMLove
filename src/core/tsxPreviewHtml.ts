/**
 * tsxPreviewHtml — the preview document for a compiled React component.
 * Same look and error reporting as HTML previews, plus an import map
 * that resolves bare specifiers to esm.sh and a `#hv-root` to mount into.
 */
import { PREVIEW_RUNTIME_SCRIPT, previewBaseCss, TAILWIND_CDN } from "./previewHtml";
import { buildImportMap } from "./packages";

export interface TsxDocOptions {
  code: string;
  css?: string;
  externals?: string[];
  canvas?: "light" | "dark";
  paused?: boolean;
  usesTailwind?: boolean;
  /** Props handed to the component through `window.__hvProps`. */
  props?: Record<string, unknown>;
  /** pkg -> version pins from playground.deps.json. */
  versionOverrides?: Record<string, string>;
  /** specifier -> full URL overrides from playground.deps.json. */
  urlOverrides?: Record<string, string>;
  /** Extra CSS injected after the component's own (design tokens). */
  extraCss?: string;
}

/** JSON that is safe to sit inside an inline <script> tag. */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildTsxPreviewDoc(options: TsxDocOptions): string {
  const {
    code,
    css = "",
    externals = [],
    canvas = "light",
    paused = false,
    usesTailwind = false,
    props,
    versionOverrides,
    urlOverrides,
    extraCss = "",
  } = options;

  const importMap = buildImportMap(externals, versionOverrides, urlOverrides);
  const importMapTag =
    Object.keys(importMap.imports).length > 0
      ? `<script type="importmap">${JSON.stringify(importMap)}</script>`
      : "";
  const propsTag =
    props && Object.keys(props).length > 0
      ? `<script>window.__hvProps = ${jsonForScript(props)};</script>`
      : "";

  const pauseCss = paused ? "*{animation-play-state:paused !important}" : "";
  const rootCss = "#hv-root{width:100%;display:flex;flex-direction:column;align-items:center}";

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${usesTailwind ? `<script src="${TAILWIND_CDN}"></script>` : ""}
<style>${previewBaseCss(canvas)}
${rootCss}</style>
${css ? `<style id="hv-component-css">${css}</style>` : ""}
${extraCss ? `<style id="hv-tokens">${extraCss}</style>` : ""}
${pauseCss ? `<style id="hv-pause">${pauseCss}</style>` : ""}
${importMapTag}
</head>
<body>
<div class="hv-stage"><div id="hv-root"></div></div>
${propsTag}
<script type="module">${code}</script>
<script>${PREVIEW_RUNTIME_SCRIPT}</script>
</body>
</html>`;
}
