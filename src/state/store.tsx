/**
 * App-wide state: the current folder session, the active view (gallery or
 * a component's detail), shared preview preferences and errors.
 * Deliberately a plain React context — no external state library needed.
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
}

const StoreContext = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const backend = serverBackend;
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
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
  const openComponent = useCallback(
    (id: string) => setView({ mode: "detail", id }),
    [],
  );
  const backToGallery = useCallback(() => setView({ mode: "gallery" }), []);

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
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
