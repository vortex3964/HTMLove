/**
 * import analysis — everything the compile pipeline needs to know about
 * a file's imports, without any parser dependency (the dialect here is
 * plain ESM + TS type imports).
 */

export interface ImportName {
  kind: "named" | "default" | "namespace";
  imported: string;
}

export interface ImportRef {
  specifier: string;
  names: ImportName[];
  sideEffectOnly: boolean;
}

/* ------------------------------------------------------------------ */
/* tiny posix path helpers (the app never sees OS paths here)          */
/* ------------------------------------------------------------------ */

export function dirnameOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

export function joinPaths(base: string, rel: string): string {
  const parts = `${base}/${rel}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

const STATEMENT_RE =
  /\b(import|export)\s+(?:type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']/g;

/**
 * Remove comments so words inside them ("// import x from ...") never
 * count as imports. Strings and template literals are tracked so
 * comment-like text inside them (URLs!) survives untouched.
 */
export function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  let mode: "code" | "line" | "block" | "single" | "double" | "template" = "code";

  while (i < n) {
    const ch = source[i];
    const next = source[i + 1] ?? "";
    if (mode === "code") {
      if (ch === "/" && next === "/") {
        mode = "line";
        i += 2;
        out += "  ";
      } else if (ch === "/" && next === "*") {
        mode = "block";
        i += 2;
        out += "  ";
      } else {
        if (ch === "'") mode = "single";
        else if (ch === '"') mode = "double";
        else if (ch === "`") mode = "template";
        out += ch;
        i += 1;
      }
    } else if (mode === "line") {
      if (ch === "\n") {
        mode = "code";
        out += ch;
      } else {
        out += " ";
      }
      i += 1;
    } else if (mode === "block") {
      if (ch === "*" && next === "/") {
        mode = "code";
        i += 2;
        out += "  ";
      } else {
        out += ch === "\n" ? "\n" : " ";
        i += 1;
      }
    } else {
      /* inside a string / template literal */
      if (ch === "\\") {
        out += ch + next;
        i += 2;
        continue;
      }
      if (
        (mode === "single" && ch === "'") ||
        (mode === "double" && ch === '"') ||
        (mode === "template" && ch === "`")
      ) {
        mode = "code";
      }
      out += ch;
      i += 1;
    }
  }
  return out;
}

function parseClause(clause: string): ImportName[] {
  const names: ImportName[] = [];
  let rest = clause.trim();
  if (!rest) return names;

  const namespace = /^\*\s*as\s+[\w$]+/.exec(rest);
  if (namespace) {
    names.push({ kind: "namespace", imported: "*" });
    return names;
  }

  const def = /^([\w$]+)/.exec(rest);
  if (def) {
    names.push({ kind: "default", imported: def[1] });
    rest = rest.slice(def[0].length).replace(/^\s*,\s*/, "");
  }

  const brace = /\{([\s\S]*?)\}/.exec(rest);
  if (brace) {
    for (const part of brace[1].split(",")) {
      const cleaned = part.trim().replace(/^type\s+/, "");
      if (!cleaned) continue;
      const asMatch = /^([\w$]+)\s+as\s+[\w$]+$/.exec(cleaned);
      names.push({ kind: "named", imported: asMatch ? asMatch[1] : cleaned });
    }
  }
  return names;
}

/** All static imports and re-exports of a module. */
export function parseImports(source: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const cleaned = stripComments(source);
  const re = new RegExp(STATEMENT_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(cleaned)) !== null) {
    if (match[4] !== undefined) {
      refs.push({ specifier: match[4], names: [], sideEffectOnly: true });
      continue;
    }
    refs.push({
      specifier: match[3],
      names: parseClause(match[2] ?? ""),
      sideEffectOnly: false,
    });
  }
  return refs;
}

/** The names a given module expects from `specifier` (used for stubs). */
export function extractImportedNames(source: string, specifier: string): ImportName[] {
  return (
    parseImports(source)
      .filter((ref) => ref.specifier === specifier)
      .flatMap((ref) => ref.names) ?? []
  );
}

/* ------------------------------------------------------------------ */
/* classification                                                      */
/* ------------------------------------------------------------------ */

export const REACT_SPECIFIERS = new Set([
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
]);

/** A package name that should come from the CDN / import map. */
export function isNpmSpecifier(spec: string): boolean {
  if (!spec) return false;
  if (spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#")) return false;
  if (spec.startsWith("@/")) return false;
  if (/^[a-zA-Z]:[\\/]/.test(spec)) return false;
  if (/^https?:\/\//.test(spec) || spec.startsWith("data:")) return false;
  return true;
}

const PROBE_EXTENSIONS = [
  "",
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".txt",
];

/**
 * The folder a file's `@/` alias is rooted at: the snippet folder the
 * file lives in (its top-level segment under the scan root). A file at
 * `carousel/components/ui/button.tsx` treats `carousel/` as its project
 * root, because a folder of snippets is a folder of little projects.
 * Files at the scan root keep the root itself.
 */
export function aliasBaseOf(fromDir: string): string {
  const cut = fromDir.indexOf("/");
  return cut === -1 ? fromDir : fromDir.slice(0, cut);
}

/**
 * The local paths (no extension) a specifier could point at, best
 * first. `@/` imports prefer the file's own snippet folder and fall back
 * to the scan root, so both a snippet collection and a single project
 * folder resolve, whichever layout the files actually use.
 */
export function localBasesFor(specifier: string, fromDir: string): string[] | null {
  if (specifier.startsWith("@/")) {
    const rest = specifier.slice(2);
    if (rest.startsWith("..")) return null;
    const snippet = aliasBaseOf(fromDir);
    const bases: string[] = [];
    if (snippet) bases.push(joinPaths(snippet, rest));
    bases.push(rest);
    return bases;
  }
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return [joinPaths(fromDir, specifier)];
  }
  if (specifier.startsWith("/")) return [specifier.slice(1)];
  return null;
}

function probeBase(base: string, known: Set<string>): string | null {
  const candidates = PROBE_EXTENSIONS.map((ext) => base + ext);
  for (const ext of PROBE_EXTENSIONS.slice(1)) candidates.push(`${base}/index${ext}`);
  return candidates.find((candidate) => known.has(candidate)) ?? null;
}

/**
 * Map a relative or `@/` import to a real file inside the scanned
 * folder, probing common extensions and index files. Returns null when
 * the file simply is not there.
 */
export function resolveLocalCandidate(
  spec: string,
  importer: string,
  known: Set<string>,
): string | null {
  const bases = localBasesFor(spec, dirnameOf(importer));
  if (bases === null) return null;
  for (const base of bases) {
    if (base === "" || base.startsWith("..")) continue;
    const hit = probeBase(base, known);
    if (hit) return hit;
  }
  return null;
}

/**
 * Every path in `files` that some file imports locally. Those are the
 * dependencies of a component (sub-components, vendored helpers), so the
 * catalog never shows them as gallery entries of their own. Uses the
 * same resolution as the compiler, so what previews load is what counts
 * as a dependency here.
 */
export function collectImportedFiles(files: Readonly<Record<string, string>>): Set<string> {
  const known = new Set(Object.keys(files));
  const imported = new Set<string>();
  for (const [rel, text] of Object.entries(files)) {
    if (!text) continue;
    for (const ref of parseImports(text)) {
      const resolved = resolveLocalCandidate(ref.specifier, rel, known);
      if (resolved !== null && resolved !== rel) imported.add(resolved);
    }
  }
  return imported;
}
