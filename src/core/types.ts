/**
 * Shared types for the htmlove playground.
 */
import type { PlanEntry } from "./deps";

/** A raw folder reading as produced by a backend. */
export interface RawSnapshot {
  root: string;
  label: string;
  /** Editable text files: rel path -> content. */
  files: Record<string, string>;
  /** Static assets (images, fonts, media): rel path -> size. */
  assets: Record<string, number>;
  skipped: Array<{ path: string; reason: string }>;
  /** Raw text of playground.deps.json if the folder has one. */
  manifestText?: string | null;
}

export type ComponentKind = "html" | "txt" | "tsx";

/** One catalog entry: a snippet the user can preview and edit. */
export interface Component {
  /** Stable id — the rel path of the primary file. */
  id: string;
  /** Display name (folder name or file stem). */
  name: string;
  /** Folder that contains it, "" for the root. */
  dir: string;
  kind: ComponentKind;
  /** Rel paths of the files that make this component up. */
  htmlPath?: string;
  cssPath?: string;
  tsxPath?: string;
  txtPath?: string;
  /** e.g. "Uiverse.io · nazar-gavrylyk". */
  attribution?: string;
  /** Tailwind utility classes detected in the markup / component source. */
  usesTailwind: boolean;
  /** True when there is CSS but no HTML at all (nothing to render yet). */
  cssOnly: boolean;
  /** Images sitting next to the component (used as gallery thumbnails). */
  screenshots: string[];
  /** Static import plan (React sources only, otherwise empty). */
  imports: PlanEntry[];
  /** Remote urls referenced by the component (images, fonts, backgrounds). */
  remoteAssets: string[];
}

export interface CatalogResult {
  components: Component[];
  /** playground.deps.json and friends — never shown as components. */
  configFiles: string[];
  /** js/ts/md/json helper files that might be imported by components. */
  supportFiles: string[];
}

export type BackendKind = "server" | "fsa";

/** The active folder session: files, originals and the built catalog. */
export interface Session {
  backendKind: BackendKind;
  /** Absolute path (server backend) or folder name (fsa backend). */
  root: string;
  label: string;
  files: Map<string, string>;
  /** Live unsaved edits: rel path -> content. */
  edits: Map<string, string>;
  assets: Map<string, number>;
  skipped: Array<{ path: string; reason: string }>;
  manifestText: string | null;
  catalog: Component[];
}

/** Result of the doctor's Resolve action (vendoring missing imports). */
export interface ResolveReport {
  /** Rel paths of the files that were fetched and written. */
  written: string[];
  /** Files the resolver deliberately left alone. */
  skipped: Array<{ path: string; reason: string }>;
  /** Imports that no rule or preset could satisfy. */
  unresolved: Array<{ specifier: string; reason: string }>;
  notes: string[];
}
