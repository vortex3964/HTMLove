/**
 * App-wide state: the current folder session, scanning progress and errors.
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
import { addRecent } from "../core/persist";
import type { Session } from "../core/types";
import { serverBackend } from "../backends/server";
import type { FileBackend } from "../backends/types";

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
}

const StoreContext = createContext<StoreShape | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const backend = serverBackend;
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    }),
    [backend, session, busy, error, clearError, pickerOpen, openPicker, closePicker, loadFolder, rescan],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
