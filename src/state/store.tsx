/**
 * App-wide state: the current folder session, live edits, the active view
 * (gallery or a component's detail) shared preview preferences and
 * errors. Deliberately a plain React context — no external state library.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildCatalog } from "../core/catalog";
import { applySavedFiles, dirtyPaths } from "../core/edits";
import { scheduleDraftSave } from "../core/drafts";
import {
  addRecent,
  getPrefs,
  savePrefs,
  type Prefs,
} from "../core/persist";
import type { Session } from "../core/types";
import { serverBackend } from "../backends/server";
import type { FileBackend } from "../backends/types";

export type ViewState = { mode: "gallery" } | { mode: "detail"; id: string };

export interface StoreShape {
  backend: FileBackend;
  session: Session | null;
  /** True while a folder is being scanned. */
  busy: boolean;
  error: string | null;
  clearError(): void;
  pickerOpen: boolean;
  openPicker(): void;
  closePicker(): void;
  loadFolder(root: string): Promise<void>;
  rescan(): Promise<void>;

  view: ViewState;
  openComponent(id: string): void;
  backToGallery(): void;

  prefs: Prefs;
  setPrefs(patch: Partial<Prefs>): void;

  /** Live editing. */
  setEdit(path: string, content: string): void;
  discardEdits(paths?: string[]): void;
  saveEdits(): Promise<void>;
  saving: boolean;
  lastSavedAt: number | null;
  /** Paths with unsaved changes (derived). */
  dirty: string[];
}

const StoreContext = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const backend = serverBackend;
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<ViewState>({ mode: "gallery" });
  const [prefs, setPrefsState] = useState<Prefs>(() => getPrefs());

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const loadFolder = useCallback(
    async (root: string) => {
      setBusy(true);
      setError(null);
      try {
        const snapshot = await backend.scan(root);
        const { components } = buildCatalog(snapshot);
        setSession({
          backendKind: "server",
          root: snapshot.root,
          label: snapshot.label,
          files: new Map(Object.entries(snapshot.files)),
          edits: new Map(),
          assets: new Map(Object.entries(snapshot.assets)),
          skipped: snapshot.skipped ?? [],
          manifestText: snapshot.manifestText ?? null,
          catalog: components,
        });
        addRecent(snapshot.root, snapshot.label);
        setView({ mode: "gallery" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [backend],
  );

  const rescan = useCallback(async () => {
    if (session) await loadFolder(session.root);
  }, [session, loadFolder]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const clearError = useCallback(() => setError(null), []);
  const openComponent = useCallback((id: string) => setView({ mode: "detail", id }), []);
  const backToGallery = useCallback(() => setView({ mode: "gallery" }), []);

  /* ------------------------------------------------------------ */
  /* live editing                                                  */
  /* ------------------------------------------------------------ */

  const setEdit = useCallback(
    (path: string, content: string) => {
      if (!session) return;
      const baseline = session.files.get(path) ?? "";
      const edits = new Map(session.edits);
      const isBaseline = content === baseline;
      if (isBaseline) edits.delete(path);
      else edits.set(path, content);
      setSession({ ...session, edits });
      scheduleDraftSave(session.root, path, content, isBaseline);
    },
    [session],
  );

  const discardEdits = useCallback(
    (paths?: string[]) => {
      if (!session) return;
      const edits = new Map(session.edits);
      const targets = paths ?? [...edits.keys()];
      for (const path of targets) {
        edits.delete(path);
        scheduleDraftSave(session.root, path, "", true);
      }
      setSession({ ...session, edits });
    },
    [session],
  );

  const saveEdits = useCallback(async () => {
    if (!session) return;
    const dirty = dirtyPaths(session);
    if (dirty.length === 0) return;
    setSaving(true);
    try {
      const saved = new Map<string, string>();
      for (const path of dirty) {
        const content = session.edits.get(path) ?? "";
        await backend.writeFile(session.root, path, content);
        saved.set(path, content);
        scheduleDraftSave(session.root, path, "", true);
      }
      setSession(applySavedFiles(session, saved));
      setLastSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [session, backend]);

  const dirty = useMemo(() => (session ? dirtyPaths(session) : []), [session]);

  const value = useMemo<StoreShape>(
    () => ({
      backend,
      session,
      busy,
      error,
      clearError,
      pickerOpen,
      openPicker,
      closePicker,
      loadFolder,
      rescan,
      view,
      openComponent,
      backToGallery,
      prefs,
      setPrefs,
      setEdit,
      discardEdits,
      saveEdits,
      saving,
      lastSavedAt,
      dirty,
    }),
    [
      backend,
      session,
      busy,
      error,
      clearError,
      pickerOpen,
      openPicker,
      closePicker,
      loadFolder,
      rescan,
      view,
      openComponent,
      backToGallery,
      prefs,
      setPrefs,
      setEdit,
      discardEdits,
      saveEdits,
      saving,
      lastSavedAt,
      dirty,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
