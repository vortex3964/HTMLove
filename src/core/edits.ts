/**
 * Pure helpers around live edits: what the preview reads, what counts as
 * unsaved, how a successful save folds into the baseline.
 */
import type { Component, Session } from "./types";

/** The content a preview/editor should show for `path` (edit wins over disk). */
export function effectiveFile(session: Session, path: string | undefined): string {
  if (!path) return "";
  const edited = session.edits.get(path);
  if (edited !== undefined) return edited;
  return session.files.get(path) ?? "";
}

/** Paths whose live edit differs from what was last read/saved. */
export function dirtyPaths(session: Session): string[] {
  const out: string[] = [];
  for (const [path, content] of session.edits) {
    if ((session.files.get(path) ?? "") !== content) out.push(path);
  }
  return out.sort();
}

/**
 * Carry unsaved edits from a previous session into a fresh snapshot of the
 * same folder (a rescan): keep an edit only when the file still exists and
 * still differs from what is now on disk.
 */
export function carryEdits(
  previous: Session | null,
  root: string,
  files: ReadonlyMap<string, string>,
): Map<string, string> {
  const carried = new Map<string, string>();
  if (!previous || previous.root !== root) return carried;
  for (const [path, content] of previous.edits) {
    if (files.has(path) && content !== files.get(path)) carried.set(path, content);
  }
  return carried;
}

/** Fold successfully saved files into the session baseline. */
export function applySavedFiles(session: Session, saved: Map<string, string>): Session {
  const files = new Map(session.files);
  const edits = new Map(session.edits);
  for (const [path, content] of saved) {
    files.set(path, content);
    edits.delete(path);
  }
  return { ...session, files, edits };
}

/** Every file path that makes up a component. */
export function componentPaths(component: Component): string[] {
  return [component.htmlPath, component.cssPath, component.tsxPath, component.txtPath].filter(
    (p): p is string => typeof p === "string",
  );
}

export function languageFor(path: string): "html" | "css" | "javascript" {
  if (path.endsWith(".css")) return "css";
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(path)) return "javascript";
  return "html";
}
