/**
 * Draft storage: while you type, edits are kept in localStorage so a
 * reload or a crash never loses work. Drafts are cleared once the change
 * has been saved to disk (or explicitly discarded).
 */

const PREFIX = "htmlove:draft:";

const draftKey = (root: string, path: string) => `${PREFIX}${root}::${path}`;

/**
 * Drafts are stored as `{ v, at, content }` so stale ones can be swept.
 * Older raw-string drafts (from before timestamps existed) still read
 * fine and are simply rewritten in the new shape on the next keystroke.
 */
interface StoredDraft {
  v: 2;
  at: number;
  content: string;
}

function parseStoredDraft(raw: string): StoredDraft | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as StoredDraft).v === 2 &&
      typeof (parsed as StoredDraft).content === "string" &&
      typeof (parsed as StoredDraft).at === "number"
    ) {
      return parsed as StoredDraft;
    }
  } catch {
    /* not JSON — a draft written before timestamps existed */
  }
  return null;
}

export function getDraft(root: string, path: string): string | null {
  try {
    const raw = localStorage.getItem(draftKey(root, path));
    if (raw === null) return null;
    return parseStoredDraft(raw)?.content ?? raw;
  } catch {
    return null;
  }
}

export function saveDraft(root: string, path: string, content: string): void {
  try {
    const draft: StoredDraft = { v: 2, at: Date.now(), content };
    localStorage.setItem(draftKey(root, path), JSON.stringify(draft));
  } catch {
    /* storage full or unavailable — the in-memory edit still works */
  }
}

const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Forget drafts untouched for `maxAgeMs` so folders that are never
 * revisited do not pile up in localStorage forever. Older raw-string
 * drafts carry no timestamp and are left alone.
 */
export function sweepDrafts(maxAgeMs = DRAFT_MAX_AGE_MS): void {
  try {
    const now = Date.now();
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      const stored = raw === null ? null : parseStoredDraft(raw);
      if (stored && now - stored.at > maxAgeMs) doomed.push(key);
    }
    for (const key of doomed) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to sweep */
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
