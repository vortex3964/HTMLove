/**
 * Small localStorage helpers with every call guarded, because private
 * windows and test environments do not always have storage.
 */

export interface RecentFolder {
  root: string;
  label: string;
  at: number;
}

const RECENTS_KEY = "htmlove:recents";
const RECENTS_LIMIT = 12;

export function getRecents(): RecentFolder[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is RecentFolder =>
        !!r && typeof r === "object" && typeof (r as RecentFolder).root === "string",
    );
  } catch {
    return [];
  }
}

export function addRecent(root: string, label: string): void {
  try {
    const recents = getRecents().filter((r) => r.root !== root);
    recents.unshift({ root, label, at: Date.now() });
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, RECENTS_LIMIT)));
  } catch {
    /* storage unavailable — recents are a nicety, not a requirement */
  }
}

export function removeRecent(root: string): void {
  try {
    const recents = getRecents().filter((r) => r.root !== root);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* gallery / playground preferences                                    */
/* ------------------------------------------------------------------ */

export interface Prefs {
  paused: boolean;
  canvas: "light" | "dark";
}

const PREFS_KEY = "htmlove:prefs";
const DEFAULT_PREFS: Prefs = { paused: false, canvas: "light" };

export function getPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      paused: typeof parsed.paused === "boolean" ? parsed.paused : DEFAULT_PREFS.paused,
      canvas: parsed.canvas === "dark" ? "dark" : "light",
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}
