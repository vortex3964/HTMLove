/**
 * manifest — the optional `playground.deps.json` a folder can carry to
 * steer how htmlove treats its components.
 *
 *   {
 *     "packages":  { "lucide-react": "0.469.0" },          // version pins
 *     "urls":      { "@/registry/x": "https://…/x.js" },   // full URL for any specifier
 *     "stubs":     ["@untitledui/icons"],                  // always stub these
 *     "resolve":   { "./card": "registry:https://ui.shadcn.com/r/styles/new-york/*.json" },
 *     "tailwind":  false,                                  // force tailwind off everywhere
 *     "tokens":    { "--primarylw": "#6366f1" },           // design tokens for every preview
 *     "components": {                                      // per component (id or name)
 *       "glass-folder/glass.tsx": { "tailwind": true, "tokens": { "--primarylw": "tomato" } }
 *     }
 *   }
 *
 * `resolve` maps missing (stubbed) imports to fetchable sources — see
 * src/core/resolve.ts for the syntax and the built-in presets.
 */
import type { Component } from "./types";

export interface ComponentManifestEntry {
  tailwind?: boolean;
  tokens?: Record<string, string>;
}

export interface DepsManifest {
  packages?: Record<string, string>;
  urls?: Record<string, string>;
  stubs?: string[];
  /** Missing-import vendoring rules: specifier or `prefix*` -> source. */
  resolve?: Record<string, string>;
  tailwind?: boolean;
  tokens?: Record<string, string>;
  components?: Record<string, ComponentManifestEntry>;
}

export interface ManifestParseResult {
  manifest: DepsManifest;
  error?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === "string") out[key] = val;
  }
  return out;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((v): v is string => typeof v === "string");
}

/** Parse (never throws) and report what was wrong if anything. */
export function parseManifest(text: string | null | undefined): ManifestParseResult {
  if (!text || !text.trim()) return { manifest: {} };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      manifest: {},
      error: `playground.deps.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!isPlainObject(raw)) {
    return { manifest: {}, error: "playground.deps.json must contain a JSON object" };
  }
  const manifest: DepsManifest = {};
  const packages = stringRecord(raw.packages);
  if (packages) manifest.packages = packages;
  const urls = stringRecord(raw.urls);
  if (urls) manifest.urls = urls;
  const stubs = stringArray(raw.stubs);
  if (stubs) manifest.stubs = stubs;
  const resolveRules = stringRecord(raw.resolve);
  if (resolveRules) manifest.resolve = resolveRules;
  if (typeof raw.tailwind === "boolean") manifest.tailwind = raw.tailwind;
  const tokens = stringRecord(raw.tokens);
  if (tokens) manifest.tokens = tokens;
  if (isPlainObject(raw.components)) {
    const components: Record<string, ComponentManifestEntry> = {};
    for (const [key, value] of Object.entries(raw.components)) {
      if (!isPlainObject(value)) continue;
      const entry: ComponentManifestEntry = {};
      if (typeof value.tailwind === "boolean") entry.tailwind = value.tailwind;
      const componentTokens = stringRecord(value.tokens);
      if (componentTokens) entry.tokens = componentTokens;
      components[key] = entry;
    }
    manifest.components = components;
  }
  return { manifest };
}

export function serializeManifest(manifest: DepsManifest): string {
  return JSON.stringify(manifest, null, 2) + "\n";
}

/** Apply tailwind overrides from the manifest to a freshly built catalog. */
export function applyManifestToCatalog(
  components: Component[],
  manifest: DepsManifest,
): Component[] {
  return components.map((component) => {
    const entry =
      manifest.components?.[component.id] ?? manifest.components?.[component.name];
    const tailwind = entry?.tailwind ?? manifest.tailwind ?? component.usesTailwind;
    if (tailwind === component.usesTailwind) return component;
    return { ...component, usesTailwind: tailwind };
  });
}

/** Token values for one component: manifest defaults < global < per component. */
export function componentTokens(
  manifest: DepsManifest,
  component: Component,
): Record<string, string> {
  const entry =
    manifest.components?.[component.id] ?? manifest.components?.[component.name];
  return { ...(manifest.tokens ?? {}), ...(entry?.tokens ?? {}) };
}
