/**
 * resolve — turn a missing import into "where to fetch it from".
 *
 * The doctor's Resolve action asks the dev server to download the files
 * behind stubbed (unresolved) imports and write them into the folder, so
 * previews bundle the real modules instead of bare placeholders. Sources
 * come from built-in presets (shadcn/ui, magicui, the ubiquitous `cn`
 * helper) and from a `resolve` map in playground.deps.json:
 *
 *   "resolve": {
 *     "./card":               "registry:https://ui.shadcn.com/r/styles/new-york/*.json",
 *     "@/components/base/*":  "gh:untitleduico/react/components/base/*",
 *     "@/registry/magicui/*": "registry:https://magicui.design/r/*.json",
 *     "@/utils/cx":           "url:https://example.com/cx.ts",
 *     "@/lib/utils":          "builtin:cn"
 *   }
 *
 * The `*` in a rule key is a prefix wildcard and captures the rest of
 * the specifier; the `*` in the source template is replaced by that
 * capture. The importer's own extension probing (.tsx/.ts/… and /index)
 * happens later, on the server. Source kinds:
 *
 *   builtin:cn                – a tiny cn() helper (clsx + tailwind-merge)
 *   gh:<owner>/<repo>/<path>  – raw.githubusercontent.com, extension-probing
 *   rawbase:<url>             – the same probing against any HTTP base
 *   registry:<item-json-url>  – shadcn-registry item (shadcn, magicui, …)
 *   url:<file-url>            – one exact file
 *
 * Pure and side-effect free so it can be tested (and reused by the dev
 * server) without any network or filesystem.
 */
import { localBasesFor } from "./imports.ts";

export interface ResolveSource {
  kind: "builtin" | "probe" | "url" | "registry";
  /** The import this source was chosen for. */
  specifier: string;
  /** Where the module will land, relative to the folder root (no extension yet). */
  localBase: string;
  /** builtin: the module source to write. */
  text?: string;
  /** probe: raw URL prefix; `probeBase + remotePath` is probed with extensions. */
  probeBase?: string;
  /** probe: path under `probeBase` (kept so nested relative imports stay in the repo). */
  remotePath?: string;
  /** url + registry: the exact URL to fetch. */
  url?: string;
  /** registry: item name, used to pick the primary file of multi-file items. */
  itemName?: string;
  /** Short human explanation shown in tooltips and unresolved reasons. */
  note: string;
}

/** A rule that is syntactically wrong — surfaced instead of silently ignored. */
export interface InvalidRule {
  kind: "invalid";
  specifier: string;
  reason: string;
}

export type ResolveLookup = ResolveSource | InvalidRule;

/** The helper most component collections expect from `@/lib/utils`. */
export const CN_MODULE = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
`;

export const SHADCN_REGISTRY = "https://ui.shadcn.com/r/styles/new-york/";
export const MAGICUI_REGISTRY = "https://magicui.design/r/";

/** Alias paths that conventionally export the `cn` class-merge helper. */
const CN_ALIASES = new Set([
  "lib/utils",
  "lib/cn",
  "components/lib/utils",
  "utils/cn",
  "components/utils",
]);

const HTTP = /^https?:\/\//;

/**
 * Where a specifier would be written inside the folder, or null when it
 * is not local. `@/` specs prefer the file's own snippet folder (the
 * top-level segment of `fromDir`) and fall back to the folder root —
 * the same order the compiler resolves them in.
 */
export function localBaseFor(specifier: string, fromDir: string): string | null {
  return localBasesFor(specifier, fromDir)?.[0] ?? null;
}

function basenameOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function originOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

interface RuleMatch {
  value: string;
  star: string;
}

/** Exact rule first, then the longest matching `prefix*` rule. */
export function matchRule(specifier: string, resolve: Record<string, string>): RuleMatch | null {
  const exact = resolve[specifier];
  if (typeof exact === "string") return { value: exact, star: "" };

  let best: RuleMatch | null = null;
  let bestPrefix = -1;
  for (const [key, value] of Object.entries(resolve)) {
    if (typeof value !== "string" || !key.endsWith("*")) continue;
    const prefix = key.slice(0, -1);
    if (!specifier.startsWith(prefix)) continue;
    if (prefix.length > bestPrefix) {
      bestPrefix = prefix.length;
      best = { value, star: specifier.slice(prefix.length) };
    }
  }
  return best;
}

function invalid(specifier: string, reason: string): InvalidRule {
  return { kind: "invalid", specifier, reason };
}

function parseSource(
  value: string,
  star: string,
  specifier: string,
  localBase: string,
): ResolveSource | InvalidRule {
  if (value === "builtin:cn") {
    return { kind: "builtin", specifier, localBase, text: CN_MODULE, note: "built-in cn() helper" };
  }

  if (value.startsWith("gh:")) {
    const parts = value.slice(3).split("/");
    if (parts.length < 3 || !parts[0] || !parts[1]) {
      return invalid(specifier, `bad gh rule "${value}" — expected gh:<owner>/<repo>/<path>`);
    }
    const path = parts.slice(2).join("/").replace("*", star);
    return {
      kind: "probe",
      specifier,
      localBase,
      probeBase: `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/HEAD/`,
      remotePath: path,
      note: `github.com/${parts[0]}/${parts[1]}`,
    };
  }

  if (value.startsWith("rawbase:")) {
    const tpl = value.slice("rawbase:".length);
    const starAt = tpl.indexOf("*");
    const prefix = starAt === -1 ? tpl : tpl.slice(0, starAt);
    const suffix = starAt === -1 ? "" : tpl.slice(starAt + 1);
    if (!HTTP.test(prefix)) {
      return invalid(specifier, `rawbase rule must point at an http(s) URL: "${value}"`);
    }
    return {
      kind: "probe",
      specifier,
      localBase,
      probeBase: prefix,
      remotePath: star + suffix,
      note: originOf(prefix),
    };
  }

  if (value.startsWith("registry:")) {
    const url = value.slice("registry:".length).replace("*", star);
    if (!HTTP.test(url)) {
      return invalid(specifier, `registry rule must point at an http(s) item URL: "${value}"`);
    }
    const itemName = basenameOf(star) || basenameOf(url).replace(/\.json$/i, "");
    return {
      kind: "registry",
      specifier,
      localBase,
      url,
      itemName,
      note: `registry item "${itemName}" on ${originOf(url)}`,
    };
  }

  if (value.startsWith("url:")) {
    const url = value.slice("url:".length).replace("*", star);
    if (!HTTP.test(url)) {
      return invalid(specifier, `url rule must point at an http(s) file: "${value}"`);
    }
    return { kind: "url", specifier, localBase, url, note: `file on ${originOf(url)}` };
  }

  return invalid(
    specifier,
    `unknown source "${value}" — use builtin:cn, gh:, rawbase:, registry: or url:`,
  );
}

/**
 * Pick a source for `specifier`: a `resolve` rule from the folder's
 * manifest wins, then the built-in presets, otherwise null (stub only).
 */
export function sourceForSpecifier(
  specifier: string,
  fromDir: string,
  resolve: Record<string, string> = {},
): ResolveLookup | null {
  const bases = localBasesFor(specifier, fromDir);
  if (bases === null || bases.length === 0) return null;
  const localBase = bases[0];

  const rule = matchRule(specifier, resolve);
  if (rule) return parseSource(rule.value, rule.star, specifier, localBase);

  if (bases.some((base) => CN_ALIASES.has(base))) {
    return parseSource("builtin:cn", "", specifier, localBase);
  }

  const magicui = /^@\/registry\/magicui\/([^/]+)$/.exec(specifier);
  if (magicui) {
    return parseSource(`registry:${MAGICUI_REGISTRY}${magicui[1]}.json`, "", specifier, localBase);
  }

  const ui = /^@\/components\/ui\/([^/]+)$/.exec(specifier);
  if (ui) {
    return parseSource(`registry:${SHADCN_REGISTRY}${ui[1]}.json`, "", specifier, localBase);
  }

  const hook = /^@\/(?:components\/hooks|hooks)\/([^/]+)$/.exec(specifier);
  if (hook) {
    return parseSource(`registry:${SHADCN_REGISTRY}${hook[1]}.json`, "", specifier, localBase);
  }

  return null;
}
