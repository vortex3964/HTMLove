/**
 * Draft storage: while you type, edits are kept in localStorage so a
 * reload or a crash never loses work. Drafts are cleared once the change
 * has been saved to disk (or explicitly discarded).
 */

const PREFIX = "htmlove:draft:";

const draftKey = (root: string, path: string) => `${PREFIX}${root}::${path}`;

export function getDraft(root: string, path: string): string | null {
  try {
    return localStorage.getItem(draftKey(root, path));
  } catch {
    return null;
  }
}

export function saveDraft(root: string, path: string, content: string): void {
  try {
    localStorage.setItem(draftKey(root, path), content);
  } catch {
    /* storage full or unavailable — the in-memory edit still works */
  }
}

export function clearDraft(root: string, path: string): void {
  try {
    localStorage.removeItem(draftKey(root, path));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* debounced writes                                                    */
/* ------------------------------------------------------------------ */

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Debounce draft writes so typing stays smooth on big files. When the
 * content has been brought back to the on-disk baseline, any existing
 * draft is removed instead of rewritten.
 */
export function scheduleDraftSave(
  root: string,
  path: string,
  content: string,
  isBaseline: boolean,
  delay = 400,
): void {
  const key = draftKey(root, path);
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      if (isBaseline) clearDraft(root, path);
      else saveDraft(root, path, content);
    }, delay),
  );
}

/** Test hook: drop every pending debounced draft write. */
export function cancelScheduledDrafts(): void {
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    timers.delete(key);
  }
}
