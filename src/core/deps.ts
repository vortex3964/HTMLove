/**
 * deps — a static dependency report for any component source. Powers the
 * Dependencies panel and the gallery badges without running a compiler.
 */
import {
  isNpmSpecifier,
  parseImports,
  resolveLocalCandidate,
  REACT_SPECIFIERS,
} from "./imports";

export type PlanStatus = "react" | "external" | "local" | "asset" | "stub";

export interface PlanEntry {
  specifier: string;
  status: PlanStatus;
  /** Rel path of the real file when status is "local" or "asset". */
  resolved?: string;
  /** Imported names (best effort). */
  names: string[];
  note: string;
}

/** The slice of playground.deps.json that shapes the import plan. */
export interface ManifestLike {
  packages?: Record<string, string>;
  urls?: Record<string, string>;
  stubs?: string[];
}

export function planImports(
  source: string,
  importerPath: string,
  files: ReadonlySet<string>,
  assets: ReadonlySet<string>,
  manifest?: ManifestLike,
): PlanEntry[] {
  const known = new Set<string>([...files, ...assets]);
  const entries: PlanEntry[] = [];

  for (const ref of parseImports(source)) {
    const names = ref.names.filter((n) => n.kind !== "namespace").map((n) => n.imported);

    if (manifest?.stubs?.includes(ref.specifier)) {
      entries.push({
        specifier: ref.specifier,
        status: "stub",
        names,
        note: "stubbed via playground.deps.json",
      });
      continue;
    }
    if (manifest?.urls?.[ref.specifier]) {
      entries.push({
        specifier: ref.specifier,
        status: "external",
        names,
        note: "custom URL from playground.deps.json",
      });
      continue;
    }
    if (REACT_SPECIFIERS.has(ref.specifier)) {
      entries.push({ specifier: ref.specifier, status: "react", names, note: "provided by htmlove" });
      continue;
    }
    if (/^https?:\/\//.test(ref.specifier) || ref.specifier.startsWith("data:")) {
      entries.push({ specifier: ref.specifier, status: "external", names, note: "direct URL import" });
      continue;
    }
    if (isNpmSpecifier(ref.specifier)) {
      const pinned = manifest?.packages?.[ref.specifier];
      entries.push({
        specifier: ref.specifier,
        status: "external",
        names,
        note: pinned ? `pinned to ${pinned} on esm.sh` : "loaded from esm.sh",
      });
      continue;
    }

    const resolved = resolveLocalCandidate(ref.specifier, importerPath, known);
    if (resolved) {
      const isAsset = assets.has(resolved);
      entries.push({
        specifier: ref.specifier,
        resolved,
        status: isAsset ? "asset" : "local",
        names,
        note: isAsset ? "bundled as a placeholder asset" : "bundled from the folder",
      });
      continue;
    }
    entries.push({
      specifier: ref.specifier,
      status: "stub",
      names,
      note: "not in this folder — stubbed placeholder",
    });
  }

  return entries;
}
