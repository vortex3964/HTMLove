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
/* last folder — so a relaunch lands straight back on the dashboard    */
/* ------------------------------------------------------------------ */

export interface LastFolder {
  root: string;
  label: string;
}

const LAST_FOLDER_KEY = "htmlove:last-folder";

export function getLastFolder(): LastFolder | null {
  try {
    const raw = localStorage.getItem(LAST_FOLDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastFolder>;
    if (typeof parsed.root !== "string" || parsed.root === "") return null;
    return {
      root: parsed.root,
      label: typeof parsed.label === "string" && parsed.label !== "" ? parsed.label : parsed.root,
    };
  } catch {
    return null;
  }
}

export function setLastFolder(root: string, label: string): void {
  try {
    localStorage.setItem(LAST_FOLDER_KEY, JSON.stringify({ root, label }));
  } catch {
    /* ignore */
  }
}

export function clearLastFolder(): void {
  try {
    localStorage.removeItem(LAST_FOLDER_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* dashboard state — which components are mounted, and their props     */
/* ------------------------------------------------------------------ */

const boardKey = (root: string) => `htmlove:board:${root}`;
const propsKey = (root: string) => `htmlove:props:${root}`;

export function getBoard(root: string): string[] {
  try {
    const raw = localStorage.getItem(boardKey(root));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

export function saveBoard(root: string, ids: string[]): void {
  try {
    localStorage.setItem(boardKey(root), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function getStoredProps(root: string): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(propsKey(root));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, Record<string, unknown>>;
  } catch {
    return {};
  }
}

export function saveStoredProps(root: string, props: Record<string, Record<string, unknown>>): void {
  try {
    localStorage.setItem(propsKey(root), JSON.stringify(props));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* playground preferences                                              */
/* ------------------------------------------------------------------ */

export interface Prefs {
  paused: boolean;
  /** Dashboard grid columns. */
  columns: number;
}

const PREFS_KEY = "htmlove:prefs";
const DEFAULT_PREFS: Prefs = { paused: false, columns: 3 };

export function getPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      paused: typeof parsed.paused === "boolean" ? parsed.paused : DEFAULT_PREFS.paused,
      columns:
        typeof parsed.columns === "number" && parsed.columns >= 2 && parsed.columns <= 4
          ? Math.round(parsed.columns)
          : DEFAULT_PREFS.columns,
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
