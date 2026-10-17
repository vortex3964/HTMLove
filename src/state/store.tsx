/**
 * App-wide state: the current folder session, live edits, the active view
 * (gallery, a component's detail or the dependency doctor), shared preview
 * preferences and errors. Deliberately a plain React context — no external
 * state library.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildCatalog } from "../core/catalog";
import { componentPaths, dirtyPaths } from "../core/edits";
import { scheduleDraftSave } from "../core/drafts";
import { planImports } from "../core/deps";
import { rewriteDeadAssets } from "../core/assets";
import {
  applyManifestToCatalog,
  parseManifest,
  serializeManifest,
  type DepsManifest,
} from "../core/manifest";
import {
  addRecent,
  getPrefs,
  savePrefs,
  type Prefs,
} from "../core/persist";
import type { Component, Session } from "../core/types";
import { serverBackend } from "../backends/server";
import type { FileBackend } from "../backends/types";

export type ViewState =
  | { mode: "gallery" }
  | { mode: "detail"; id: string }
  | { mode: "doctor" };

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
  openDoctor(): void;
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

  /** playground.deps.json, parsed from the current session. */
  manifest: DepsManifest;
  manifestError: string | null;
  /** Write a new manifest (merged by the caller) back to the folder. */
  saveManifest(next: DepsManifest): Promise<void>;

  /** Design-token values the user adjusted this session. */
  tokens: Record<string, string>;
  setToken(name: string, value: string): void;

  /**
   * Replace dead remote-asset URLs inside a component's files (as edits).
   * Returns the number of files touched.
   */
  applyAssetFix(componentId: string, dead: string[]): number;
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
  const [tokens, setTokensState] = useState<Record<string, string>>({});

  /**
   * The session always has an up-to-date ref: several edits can be applied
   * in one handler (asset fixes touch a file per url) and each must build
   * on the previous result, not on the last rendered state.
   */
  const sessionRef = useRef<Session | null>(null);
  const applySession = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  sessionRef.current = session;

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
        const { manifest } = parseManifest(snapshot.manifestText);
        const { components } = buildCatalog(snapshot, manifest);
        applySession({
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
        setTokensState({});
        addRecent(snapshot.root, snapshot.label);
        setView({ mode: "gallery" });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [backend, applySession],
  );

  const rescan = useCallback(async () => {
    const current = sessionRef.current;
    if (current) await loadFolder(current.root);
  }, [loadFolder]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const clearError = useCallback(() => setError(null), []);
  const openComponent = useCallback((id: string) => setView({ mode: "detail", id }), []);
  const openDoctor = useCallback(() => setView({ mode: "doctor" }), []);
  const backToGallery = useCallback(() => setView({ mode: "gallery" }), []);

  /* ------------------------------------------------------------ */
  /* live editing                                                  */
  /* ------------------------------------------------------------ */

  const setEdit = useCallback(
    (path: string, content: string) => {
      const current = sessionRef.current;
      if (!current) return;
      const baseline = current.files.get(path) ?? "";
      const edits = new Map(current.edits);
      const isBaseline = content === baseline;
      if (isBaseline) edits.delete(path);
      else edits.set(path, content);
      scheduleDraftSave(current.root, path, content, isBaseline);
      applySession({ ...current, edits });
    },
    [applySession],
  );

  const discardEdits = useCallback(
    (paths?: string[]) => {
      const current = sessionRef.current;
      if (!current) return;
      const edits = new Map(current.edits);
      const targets = paths ?? [...edits.keys()];
      for (const path of targets) {
        edits.delete(path);
        scheduleDraftSave(current.root, path, "", true);
      }
      applySession({ ...current, edits });
    },
    [applySession],
  );

  const saveEdits = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const targets = dirtyPaths(current);
    if (targets.length === 0) return;
    setSaving(true);
    try {
      for (const path of targets) {
        const beforeWrite = sessionRef.current;
        if (!beforeWrite) break;
        const content = beforeWrite.edits.get(path);
        if (content === undefined) continue;
        await backend.writeFile(beforeWrite.root, path, content);
        const latest = sessionRef.current;
        if (!latest) break;
        const files = new Map(latest.files);
        files.set(path, content);
        const edits = new Map(latest.edits);
        /* keep edits typed while the write was in flight */
        if (edits.get(path) === content) edits.delete(path);
        scheduleDraftSave(latest.root, path, "", true);
        applySession({ ...latest, files, edits });
        setLastSavedAt(Date.now());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [backend, applySession]);

  const dirty = useMemo(() => (session ? dirtyPaths(session) : []), [session]);

  /* ------------------------------------------------------------ */
  /* manifest + tokens + asset fixes                               */
  /* ------------------------------------------------------------ */

  const manifest = useMemo(
    () => parseManifest(session?.manifestText).manifest,
    [session?.manifestText],
  );
  const manifestError = useMemo(
    () => parseManifest(session?.manifestText).error ?? null,
    [session?.manifestText],
  );

  const reapplyManifest = useCallback(
    (current: Session, next: DepsManifest): Component[] =>
      current.catalog.map((component) => {
        const withTailwind = applyManifestToCatalog([component], next)[0];
        if (component.kind !== "tsx" || !component.tsxPath) return withTailwind;
        const source =
          current.edits.get(component.tsxPath) ??
          current.files.get(component.tsxPath) ??
          "";
        return {
          ...withTailwind,
          imports: planImports(
            source,
            component.tsxPath,
            new Set(current.files.keys()),
            new Set(current.assets.keys()),
            next,
          ),
        };
      }),
    [],
  );

  const saveManifest = useCallback(
    async (next: DepsManifest) => {
      const current = sessionRef.current;
      if (!current) return;
      setSaving(true);
      try {
        const text = serializeManifest(next);
        await backend.writeFile(current.root, "playground.deps.json", text);
        const latest = sessionRef.current ?? current;
        const files = new Map(latest.files);
        files.set("playground.deps.json", text);
        applySession({
          ...latest,
          files,
          manifestText: text,
          catalog: reapplyManifest(latest, next),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    },
    [backend, applySession, reapplyManifest],
  );

  const setToken = useCallback((name: string, value: string) => {
    setTokensState((prev) => {
      const next = { ...prev };
      if (value.trim() === "") delete next[name];
      else next[name] = value;
      return next;
    });
  }, []);

  const applyAssetFix = useCallback(
    (componentId: string, dead: string[]) => {
      const current = sessionRef.current;
      if (!current || dead.length === 0) return 0;
      const component = current.catalog.find((c) => c.id === componentId);
      if (!component) return 0;
      const deadSet = new Set(dead);
      let next = current;
      let changed = 0;

      for (const path of componentPaths(component)) {
        if (!/\.(css|html?|txt|tsx|jsx)$/i.test(path)) continue;
        const content = next.edits.get(path) ?? next.files.get(path) ?? "";
        const rewritten = rewriteDeadAssets(content, deadSet);
        if (rewritten === content) continue;
        changed += 1;
        const baseline = next.files.get(path) ?? "";
        const edits = new Map(next.edits);
        if (rewritten === baseline) edits.delete(path);
        else edits.set(path, rewritten);
        scheduleDraftSave(next.root, path, rewritten, rewritten === baseline);
        next = { ...next, edits };
      }

      if (changed > 0) {
        applySession({
          ...next,
          catalog: next.catalog.map((c) =>
            c.id === componentId
              ? { ...c, remoteAssets: c.remoteAssets.filter((u) => !deadSet.has(u)) }
              : c,
          ),
        });
      }
      return changed;
    },
    [applySession],
  );

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
      openDoctor,
      backToGallery,
      prefs,
      setPrefs,
      setEdit,
      discardEdits,
      saveEdits,
      saving,
      lastSavedAt,
      dirty,
      manifest,
      manifestError,
      saveManifest,
      tokens,
      setToken,
      applyAssetFix,
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
      openDoctor,
      backToGallery,
      prefs,
      setPrefs,
      setEdit,
      discardEdits,
      saveEdits,
      saving,
      lastSavedAt,
      dirty,
      manifest,
      manifestError,
      saveManifest,
      tokens,
      setToken,
      applyAssetFix,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreShape {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}
