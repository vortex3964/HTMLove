/**
 * compile — bundle a React component (and anything it really imports
 * from the folder) into a single ES module the preview iframe can run.
 *
 * Uses esbuild (wasm build in the browser, native in tests) with a
 * resolver plugin that knows four namespaces: the entry wrapper, real
 * files from the scanned folder, generated stubs for missing imports
 * and placeholder assets.
 */
import type { OnResolveArgs } from "esbuild";
import { extractImportedNames, isNpmSpecifier, resolveLocalCandidate } from "./imports";
import { generateAssetStub, generateStubModule } from "./stubs";

export const ENTRY_MODULE = "__htmlove_entry__";

export interface EsbuildLike {
  build(options: Record<string, unknown>): Promise<{
    outputFiles?: Array<{ path: string; text: string }>;
  }>;
}

export interface CompileInput {
  /** Source of the component (live edits included). */
  source: string;
  /** Rel path of the component inside the scanned folder. */
  path: string;
  /** All readable files of the folder (rel path -> content). */
  files: Map<string, string>;
  /** Rel paths of binary assets in the folder. */
  assets: Set<string>;
  getEsbuild(): Promise<EsbuildLike>;
  /** "/" for wasm (browser), something real for native esbuild in tests. */
  absWorkingDir?: string;
  /**
   * Specifiers to stub instead of fetching (playground.deps.json "stubs").
   * React itself is never stubbed — the entry wrapper needs it.
   */
  forceStub?: Set<string>;
}

export type CompileResult =
  | {
      ok: true;
      code: string;
      css: string;
      externals: string[];
      stubs: string[];
    }
  | {
      ok: false;
      errors: string[];
    };

function loaderFor(path: string): string {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (/\.(m|c)?js$/.test(path)) return "jsx"; // tolerate JSX in plain js files
  if (path.endsWith(".css")) return "css";
  if (path.endsWith(".json")) return "json";
  return "text";
}

/**
 * The wrapper module: imports the user's component, picks the default
 * (or first capitalised) export, wraps it in an error boundary that
 * reports back to the parent window and mounts it.
 */
export function buildEntryModule(relPath: string): string {
  return `
import * as __hvModule from ${JSON.stringify(`./${relPath}`)};
import React from "react";
import { createRoot } from "react-dom/client";

const __hvPick = () => {
  const mod = __hvModule;
  if (mod && mod.default !== undefined && mod.default !== null) return mod.default;
  for (const key of Object.keys(mod)) {
    if (/^[A-Z]/.test(key)) {
      const value = mod[key];
      if (typeof value === "function" || (value && typeof value === "object")) return value;
    }
  }
  return null;
};

class __HvBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) {
    try {
      parent.postMessage({ source: "htmlove-preview", type: "error",
        message: "Render error: " + String((err && err.message) || err) }, "*");
    } catch (e) {}
  }
  render() {
    if (this.state.err) {
      return React.createElement("div", {
        style: { padding: "14px 16px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: "12px", color: "#b91c1c", background: "#fef2f2",
          border: "1px solid #f3caca", borderRadius: "8px", maxWidth: "560px", whiteSpace: "pre-wrap" }
      }, "Render error: " + String((this.state.err && this.state.err.message) || this.state.err));
    }
    return this.props.children;
  }
}

const __hvRootEl = document.getElementById("hv-root");
const __hvComp = __hvPick();
const __hvProps = (typeof window !== "undefined" && window.__hvProps) || {};
if (!__hvComp) {
  __hvRootEl.innerHTML =
    '<div style="padding:14px 16px;font-family:ui-monospace,monospace;font-size:12px;color:#71717a;border:1px dashed #d4d4dc;border-radius:8px">No component export found in this file — it only exports helpers.</div>';
} else {
  createRoot(__hvRootEl).render(React.createElement(__HvBoundary, null, React.createElement(__hvComp, __hvProps)));
}
`.trim();
}

export async function compileTsxComponent(input: CompileInput): Promise<CompileResult> {
  const { source, path, files, assets, getEsbuild, absWorkingDir = "/" } = input;
  const forceStub = new Set(
    [...(input.forceStub ?? [])].filter(
      (spec) => spec !== "react" && !spec.startsWith("react-dom"),
    ),
  );

  const esbuild = await getEsbuild();
  const externals = new Set<string>();
  const stubs: string[] = [];
  const stubModules = new Map<string, { label: string; names: ReturnType<typeof extractImportedNames> }>();

  const allFiles = new Map(files);
  allFiles.set(path, source);
  const known = new Set<string>([...allFiles.keys(), ...assets]);

  const plugin = {
    name: "htmlove",
    setup(build: {
      onResolve(
        options: { filter: RegExp },
        callback: (args: OnResolveArgs) =>
          | { path?: string; namespace?: string; external?: boolean }
          | null
      ): void;
      onLoad(
        options: { filter: RegExp; namespace?: string },
        callback: (args: { path: string }) => { contents: string; loader: string } | null
      ): void;
    }) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return { path: ENTRY_MODULE, namespace: "hv-entry" };
        const spec = args.path;
        if (/^https?:\/\//.test(spec) || spec.startsWith("data:")) return { external: true };
        if (!forceStub.has(spec) && isNpmSpecifier(spec)) {
          externals.add(spec);
          return { external: true };
        }
        const resolved = resolveLocalCandidate(spec, args.importer, known);
        if (resolved) {
          if (assets.has(resolved)) return { path: resolved, namespace: "hv-asset" };
          return { path: resolved, namespace: "hv-fs" };
        }
        const stubPath = `${args.importer}::${spec}`;
        const importerSource =
          args.importer === ENTRY_MODULE
            ? buildEntryModule(path)
            : (allFiles.get(args.importer) ?? "");
        stubModules.set(stubPath, {
          label: spec,
          names: extractImportedNames(importerSource, spec),
        });
        stubs.push(spec);
        return { path: stubPath, namespace: "hv-stub" };
      });

      build.onLoad({ filter: /.*/, namespace: "hv-entry" }, () => ({
        contents: buildEntryModule(path),
        loader: "jsx",
      }));

      build.onLoad({ filter: /.*/, namespace: "hv-fs" }, (args) => {
        const contents = allFiles.get(args.path);
        if (contents === undefined) return null;
        return { contents, loader: loaderFor(args.path) };
      });

      build.onLoad({ filter: /.*/, namespace: "hv-stub" }, (args) => {
        const info = stubModules.get(args.path);
        return {
          contents: generateStubModule(info?.label ?? args.path, info?.names ?? []),
          loader: "js",
        };
      });

      build.onLoad({ filter: /.*/, namespace: "hv-asset" }, (args) => ({
        contents: generateAssetStub(args.path),
        loader: "js",
      }));
    },
  };

  try {
    const result = await esbuild.build({
      absWorkingDir,
      entryPoints: [ENTRY_MODULE],
      bundle: true,
      write: false,
      format: "esm",
      platform: "browser",
      target: "es2020",
      jsx: "automatic",
      logLevel: "silent",
      outdir: "htmlove-out",
      define: { "process.env.NODE_ENV": '"development"' },
      plugins: [plugin],
    });

    const outputs = result.outputFiles ?? [];
    const js = outputs.find((f) => /\.js$/.test(f.path));
    const css = outputs.find((f) => /\.css$/.test(f.path));
    if (!js) {
      return { ok: false, errors: ["esbuild produced no JavaScript output"] };
    }
    return {
      ok: true,
      code: js.text,
      css: css?.text ?? "",
      externals: [...externals].sort(),
      stubs: [...new Set(stubs)],
    };
  } catch (err) {
    const esbuildError = err as {
      errors?: Array<{
        text?: string;
        location?: { file?: string; line?: number } | null;
      }>;
      message?: string;
    };
    const errors =
      Array.isArray(esbuildError.errors) && esbuildError.errors.length > 0
        ? esbuildError.errors.map((e) => {
            const where = e.location ? `${e.location.file ?? "?"}:${e.location.line ?? 0} — ` : "";
            return where + (e.text ?? "unknown error");
          })
        : [esbuildError.message ?? String(err)];
    return { ok: false, errors };
  }
}

/* ------------------------------------------------------------------ */
/* browser esbuild singleton + tiny compile cache                      */
/* ------------------------------------------------------------------ */

let esbuildPromise: Promise<EsbuildLike> | null = null;

export function getBrowserEsbuild(): Promise<EsbuildLike> {
  if (!esbuildPromise) {
    esbuildPromise = (async () => {
      const esbuild = await import("esbuild-wasm");
      const wasmUrl = (await import("esbuild-wasm/esbuild.wasm?url")).default;
      await esbuild.initialize({ wasmURL: wasmUrl, worker: false });
      return esbuild as unknown as EsbuildLike;
    })();
  }
  return esbuildPromise;
}

const compileCache = new Map<string, CompileResult>();

/**
 * Identities of the files/assets containers act as revision markers: the
 * store hands out a fresh Map/Set whenever their contents change (a save
 * or a rescan), so equal identities always mean equal inputs — including
 * the contents of local files a component imports. Content hashing here
 * would cost more than it saves on folders with many files.
 */
const inputIds = new WeakMap<object, number>();
let nextInputId = 1;
function identityOf(value: object): number {
  let id = inputIds.get(value);
  if (id === undefined) {
    id = nextInputId++;
    inputIds.set(value, id);
  }
  return id;
}

/** Compile with a tiny cache so toggling the canvas does not rebuild. */
export async function compileTsxComponentCached(input: CompileInput): Promise<CompileResult> {
  const stubKey = input.forceStub ? [...input.forceStub].sort().join("|") : "";
  const key = [
    input.path,
    input.source,
    stubKey,
    identityOf(input.files),
    identityOf(input.assets),
  ].join("::");
  const hit = compileCache.get(key);
  if (hit) return hit;
  const result = await compileTsxComponent(input);
  if (compileCache.size > 24) compileCache.clear();
  compileCache.set(key, result);
  return result;
}
