/**
 * App-wide state: the current folder session, the dashboard board (which
 * components are mounted, in what order, with which props), live edits,
 * the active view (board or dependency doctor), shared preview
 * preferences and errors. Deliberately a plain React context — no
 * external state library.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
  addToBoard as addToBoardIds,
  moveOnBoard as moveOnBoardIds,
  normalizeBoard,
  normalizeProps,
  removeFromBoard as removeFromBoardIds,
} from "../core/board";
import {
  applyManifestToCatalog,
  parseManifest,
  serializeManifest,
  type DepsManifest,
} from "../core/manifest";
import {
  addRecent,
  clearLastFolder,
  getBoard,
  getLastFolder,
  getPrefs,
  getStoredProps,
  removeRecent,
  saveBoard,
  savePrefs,
  saveStoredProps,
  setLastFolder,
  type Prefs,
} from "../core/persist";
import type { Component, Session } from "../core/types";
import { serverBackend } from "../backends/server";
import type { FileBackend } from "../backends/types";

export type ViewState = { mode: "board" } | { mode: "doctor" };

export interface StoreShape {
  backend: FileBackend;
  session: Session | null;
  /** True while a folder is being scanned. */
  busy: boolean;
  error: string | null;
  clearError(): void;
  /**
   * Set when the remembered folder could not be reopened on launch.
   * The picker opens alongside it as the fallback.
   */
  restoreNotice: string | null;
  clearRestoreNotice(): void;
  pickerOpen: boolean;
  openPicker(): void;
  closePicker(): void;
  /**
   * Scan a folder and make it the session. `auto: true` is the
   * launch-time restore: failures turn into a friendly notice instead
   * of the raw error banner.
   */
  loadFolder(root: string, options?: { auto?: boolean }): Promise<void>;
  rescan(): Promise<void>;

  view: ViewState;
  openDoctor(): void;
  showBoard(): void;

  /* -------------------------------------------------------------- */
  /* dashboard board                                                */
  /* -------------------------------------------------------------- */

  /** Component ids mounted on the board, in display order. */
  board: string[];
  addToBoard(id: string): void;
  addAllToBoard(): void;
  removeFromBoard(id: string): void;
  /** Move `id` so it lands before `beforeIndex` (an index into `board`). */
  moveOnBoard(id: string, beforeIndex: number): void;
  clearBoard(): void;

  /** Component whose code is open in the left editor drawer. */
  editingId: string | null;
  openEditor(id: string): void;
  closeEditor(): void;
  /** Put a component on the board and open its editor in one go. */
  openOnBoard(id: string): void;

  /** Per-component props; persisted per folder. */
  propsById: Record<string, Record<string, unknown>>;
  setProps(id: string, props: Record<string, unknown>): void;

  prefs: Prefs;
  setPrefs(patch: Partial<Prefs>): void;

  /** Live editing. */
  setEdit(path: string, content: string): void;
  discardEdits(paths?: string[]): void;
  /** Write every dirty file; resolves to how many were written. */
  saveEdits(): Promise<number>;
  saving: boolean;
  lastSavedAt: number | null;
  /** Paths with unsaved changes (derived). */
  dirty: string[];

  /** playground.deps.json, parsed from the current session. */
  manifest: DepsManifest;
  manifestError: string | null;
  /** Write a new manifest (merged by the caller) back to the folder. */
  saveManifest(next: DepsManifest): Promise<boolean>;

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
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [view, setView] = useState<ViewState>({ mode: "board" });
  const [prefs, setPrefsState] = useState<Prefs>(() => getPrefs());
  const [tokens, setTokensState] = useState<Record<string, string>>({});
  const [board, setBoard] = useState<string[]>([]);
  const [propsById, setPropsById] = useState<Record<string, Record<string, unknown>>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * Refs mirror the latest values so several updates can be applied in
   * one handler (asset fixes touch a file per url; board drops arrive in
   * a burst) and each builds on the previous result, not on the last
   * rendered state.
   */
  const sessionRef = useRef<Session | null>(null);
  const boardRef = useRef<string[]>([]);
  const propsRef = useRef<Record<string, Record<string, unknown>>>({});
  const applySession = useCallback((next: Session) => {
    sessionRef.current = next;
    setSession(next);
  }, []);
  sessionRef.current = session;
  boardRef.current = board;
  propsRef.current = propsById;

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  /* ------------------------------------------------------------ */
  /* board                                                         */
  /* ------------------------------------------------------------ */

  const commitBoard = useCallback((next: string[]) => {
    const current = sessionRef.current;
    if (!current || next === boardRef.current) return;
    boardRef.current = next;
    setBoard(next);
    saveBoard(current.root, next);
  }, []);

  const loadFolder = useCallback(
    async (root: string, options?: { auto?: boolean }) => {
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
        setLastFolder(snapshot.root, snapshot.label);
        /* restore what this folder had mounted, minus anything gone */
        const valid = new Set(components.map((c) => c.id));
        commitBoard(normalizeBoard(getBoard(snapshot.root), valid));
        const storedProps = normalizeProps(getStoredProps(snapshot.root), valid);
        propsRef.current = storedProps;
        setPropsById(storedProps);
        setEditingId(null);
        setRestoreNotice(null);
        setView({ mode: "board" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        removeRecent(root);
        if (options?.auto) {
          /* The remembered folder is gone — fall back to the picker. */
          clearLastFolder();
          setRestoreNotice(
            `Couldn't reopen your last folder (${root}). It may have moved or been deleted — choose one to continue.`,
          );
          setPickerOpen(true);
        } else {
          setError(message);
        }
      } finally {
        setBusy(false);
      }
    },
    [backend, applySession, commitBoard],
  );

  const rescan = useCallback(async () => {
    const current = sessionRef.current;
    if (current) await loadFolder(current.root);
  }, [loadFolder]);

  /* launch: try the folder from last time before showing a blank slate */
  const didAutoRestore = useRef(false);
  useEffect(() => {
    if (didAutoRestore.current) return;
    didAutoRestore.current = true;
    const last = getLastFolder();
    if (last) void loadFolder(last.root, { auto: true });
  }, [loadFolder]);

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const clearError = useCallback(() => setError(null), []);
  const clearRestoreNotice = useCallback(() => setRestoreNotice(null), []);
  const openDoctor = useCallback(() => setView({ mode: "doctor" }), []);
  const showBoard = useCallback(() => setView({ mode: "board" }), []);

  const addToBoard = useCallback(
    (id: string) => commitBoard(addToBoardIds(boardRef.current, id)),
    [commitBoard],
  );

  const addAllToBoard = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    let next = boardRef.current;
    for (const component of current.catalog) next = addToBoardIds(next, component.id);
    commitBoard(next);
  }, [commitBoard]);

  const removeFromBoard = useCallback(
    (id: string) => {
      commitBoard(removeFromBoardIds(boardRef.current, id));
      setEditingId((prev) => (prev === id ? null : prev));
    },
    [commitBoard],
  );

  const moveOnBoard = useCallback(
    (id: string, beforeIndex: number) => {
      commitBoard(moveOnBoardIds(boardRef.current, id, beforeIndex));
    },
    [commitBoard],
  );

  const clearBoard = useCallback(() => commitBoard([]), [commitBoard]);

  const openEditor = useCallback((id: string) => setEditingId(id), []);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const openOnBoard = useCallback(
    (id: string) => {
      commitBoard(addToBoardIds(boardRef.current, id));
      setView({ mode: "board" });
      setEditingId(id);
    },
    [commitBoard],
  );

  const setProps = useCallback((id: string, props: Record<string, unknown>) => {
    const current = sessionRef.current;
    if (!current) return;
    const prev = propsRef.current;
    const existing = prev[id];
    const isEmpty = Object.keys(props).length === 0;
    if (isEmpty && !existing) return;
    if (existing && JSON.stringify(existing) === JSON.stringify(props)) return;
    const next = { ...prev };
    if (isEmpty) delete next[id];
    else next[id] = props;
    propsRef.current = next;
    setPropsById(next);
    saveStoredProps(current.root, next);
  }, []);

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

  const saveEdits = useCallback(async (): Promise<number> => {
    const current = sessionRef.current;
    if (!current) return 0;
    const targets = dirtyPaths(current);
    if (targets.length === 0) return 0;
    setSaving(true);
    let written = 0;
    try {
      for (const path of targets) {
        const beforeWrite = sessionRef.current;
        if (!beforeWrite) break;
        const content = beforeWrite.edits.get(path);
        if (content === undefined) continue;
        await backend.writeFile(beforeWrite.root, path, content);
        written += 1;
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
    return written;
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
    async (next: DepsManifest): Promise<boolean> => {
      const current = sessionRef.current;
      if (!current) return false;
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
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return false;
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
      restoreNotice,
      clearRestoreNotice,
      pickerOpen,
      openPicker,
      closePicker,
      loadFolder,
      rescan,
      view,
      openDoctor,
      showBoard,
      board,
      addToBoard,
      addAllToBoard,
      removeFromBoard,
      moveOnBoard,
      clearBoard,
      editingId,
      openEditor,
      closeEditor,
      openOnBoard,
      propsById,
      setProps,
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
      restoreNotice,
      clearRestoreNotice,
      pickerOpen,
      openPicker,
      closePicker,
      loadFolder,
      rescan,
      view,
      openDoctor,
      showBoard,
      board,
      addToBoard,
      addAllToBoard,
      removeFromBoard,
      moveOnBoard,
      clearBoard,
      editingId,
      openEditor,
      closeEditor,
      openOnBoard,
      propsById,
      setProps,
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
