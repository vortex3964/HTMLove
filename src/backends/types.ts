/**
 * The backend contract shared by the two file sources htmlove can use:
 * the built-in local file API (works in every browser) and — later —
 * the File System Access API on Chromium.
 */
import type { RawSnapshot } from "../core/types";

export interface BrowseEntry {
  name: string;
  path: string;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

export interface FileBackend {
  kind: string;
  /** Folder to start the picker in (server backend only). */
  home?(): Promise<string>;
  /** List subfolders (server backend only). */
  browse?(path: string): Promise<BrowseResult>;
  /** Read everything interesting under `root`. */
  scan(root: string): Promise<RawSnapshot>;
  /** Persist a text file (rel path inside root). */
  writeFile(root: string, relPath: string, content: string): Promise<void>;
  /** A URL the browser can load the asset from. */
  assetUrl(root: string, relPath: string): string;
}
