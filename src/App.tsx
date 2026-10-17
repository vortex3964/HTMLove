/**
 * htmlove — a local playground for HTML, CSS and React component snippets.
 * The shell: topbar, the sidebar-or-drawer plus board workspace, the
 * doctor view and the folder picker.
 */
import { useCallback, useEffect } from "react";
import {
  FolderOpen,
  LayoutGrid,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Save,
  Stethoscope,
  Sun,
  TriangleAlert,
  X,
} from "lucide-react";
import { StoreProvider, useStore } from "./state/store";
import { FolderPicker } from "./ui/FolderPicker";
import { Sidebar } from "./ui/Sidebar";
import { Board } from "./ui/Board";
import { EditorDrawer } from "./ui/EditorDrawer";
import { DoctorView } from "./ui/DoctorView";
import { Toasts, toast } from "./ui/Toasts";

function Shell() {
  const {
    session,
    busy,
    error,
    clearError,
    restoreNotice,
    clearRestoreNotice,
    openPicker,
    rescan,
    view,
    openDoctor,
    showBoard,
    prefs,
    setPrefs,
    dirty,
    saveEdits,
    saving,
    editingId,
  } = useStore();
  const inDoctor = view.mode === "doctor";
  const stubCount = session
    ? session.catalog.reduce(
        (total, component) =>
          total + component.imports.filter((entry) => entry.status === "stub").length,
        0,
      )
    : 0;

  const save = useCallback(async () => {
    const count = dirty.length;
    const written = await saveEdits();
    if (written > 0) toast(`Saved ${written} file${written === 1 ? "" : "s"}`);
    else if (count > 0) toast("Nothing was saved — check the error banner", "bad");
  }, [dirty.length, saveEdits]);

  /* keyboard: Cmd/Ctrl+S saves, / jumps to the sidebar search */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        if (dirty.length === 0) return;
        e.preventDefault();
        void save();
        return;
      }
      if (e.key === "/" && !typing && session && !inDoctor) {
        e.preventDefault();
        document.getElementById("hv-sidebar-search")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty.length, save, session, inDoctor]);

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">
          htmlove<span className="dot">.</span>
        </span>
        <span className="tagline">local component playground</span>
        <span className="spacer" />

        {session && (
          <>
            <span className="root-chip" title={session.root}>
              <FolderOpen size={13} />
              <span className="path">{session.root}</span>
            </span>
            {!inDoctor ? (
              <button
                className="btn ghost small"
                onClick={openDoctor}
                title="Check imports, CDN reachability and remote assets"
              >
                <Stethoscope size={13} />
                Doctor
                {stubCount > 0 && <span className="badge warn">{stubCount}</span>}
              </button>
            ) : (
              <button className="btn ghost small" onClick={showBoard} title="Back to the board">
                <LayoutGrid size={13} />
                Board
              </button>
            )}
            <button
              className="btn ghost small icon"
              onClick={() => setPrefs({ paused: !prefs.paused })}
              title={prefs.paused ? "Resume animations" : "Pause animations"}
              aria-label={prefs.paused ? "Resume animations" : "Pause animations"}
            >
              {prefs.paused ? <Play size={13} /> : <Pause size={13} />}
            </button>
            <button
              className="btn ghost small icon"
              onClick={() => setPrefs({ canvas: prefs.canvas === "light" ? "dark" : "light" })}
              title="Toggle preview background"
              aria-label="Toggle preview background"
            >
              {prefs.canvas === "light" ? <Moon size={13} /> : <Sun size={13} />}
            </button>
            <button
              className="btn ghost small icon"
              onClick={() => void rescan()}
              disabled={busy}
              title="Scan this folder again"
              aria-label="Rescan folder"
            >
              <RefreshCw size={13} />
            </button>
          </>
        )}

        {dirty.length > 0 && (
          <>
            <span className="badge warn">{dirty.length} unsaved</span>
            <button className="btn primary small" onClick={() => void save()} disabled={saving}>
              <Save size={13} />
              {saving ? "Saving…" : "Save"}
            </button>
          </>
        )}

        <button className="btn primary" onClick={openPicker} disabled={busy}>
          <FolderOpen size={14} />
          {session ? "Change folder" : "Choose folder"}
        </button>
      </header>

      {restoreNotice && (
        <div className="notice-banner" role="status">
          <TriangleAlert size={14} />
          <span>{restoreNotice}</span>
          <span className="spacer" />
          <button className="btn primary small" onClick={openPicker}>
            Choose folder
          </button>
          <button
            className="btn ghost small icon"
            onClick={clearRestoreNotice}
            aria-label="Dismiss"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <span className="spacer" />
          {session && (
            <button className="btn ghost small" onClick={() => void rescan()} disabled={busy}>
              Rescan
            </button>
          )}
          <button className="btn ghost small icon" onClick={clearError} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <main className="main">
        {busy && !session ? (
          <div className="centered">
            <div className="scanning">
              <span className="spinner-ring" />
              <span>Scanning folder…</span>
            </div>
          </div>
        ) : !session ? (
          <div className="centered">
            <section className="card empty">
              <h1>Point htmlove at a folder</h1>
              <p>
                htmlove turns any folder of loose snippets into a live dashboard. Pick a folder
                containing your HTML, CSS and React components and you can:
              </p>
              <ul>
                <li>pull components onto a board, arrange them and keep the layout</li>
                <li>watch each one run live, with props you can edit as JSON</li>
                <li>open the code beside it and save changes straight back to disk</li>
              </ul>
              <button className="btn primary" onClick={openPicker}>
                <FolderOpen size={14} />
                Choose folder
              </button>
            </section>
          </div>
        ) : inDoctor ? (
          <DoctorView />
        ) : (
          <div className="workspace">
            {editingId ? <EditorDrawer /> : <Sidebar />}
            <Board />
          </div>
        )}
      </main>

      <Toasts />
      <FolderPicker />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
