/**
 * htmlove — a local playground for HTML, CSS and React component snippets.
 */
import { FolderOpen, RefreshCw, X } from "lucide-react";
import { StoreProvider, useStore } from "./state/store";
import { FolderPicker } from "./ui/FolderPicker";
import { Gallery } from "./ui/Gallery";
import { DetailView } from "./ui/DetailView";

function Shell() {
  const { session, busy, error, clearError, openPicker, rescan, view } = useStore();
  const inDetail = view.mode === "detail";

  return (
    <div className="app">
      <header className="topbar">
        <span className="wordmark">
          htmlove<span className="dot">.</span>
        </span>
        <span className="tagline">local component playground</span>
        <span className="spacer" />

        {session && !inDetail && (
          <>
            <span className="badge">{session.catalog.length} components</span>
            <span className="root-chip" title={session.root}>
              <FolderOpen size={13} />
              <span className="path">{session.root}</span>
            </span>
            <button
              className="btn ghost small"
              onClick={() => void rescan()}
              disabled={busy}
              title="Scan again"
            >
              <RefreshCw size={13} />
            </button>
          </>
        )}

        {!inDetail && (
          <button className="btn primary" onClick={openPicker} disabled={busy}>
            <FolderOpen size={14} />
            {session ? "Change folder" : "Choose folder"}
          </button>
        )}
      </header>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button className="btn ghost small" onClick={clearError} aria-label="Dismiss">
            <X size={13} />
          </button>
        </div>
      )}

      <main className="main">
        {busy ? (
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
                htmlove turns any folder of loose snippets into a live playground. Pick a
                folder containing your HTML, CSS and React components and it will:
              </p>
              <ul>
                <li>
                  catalog every component it finds (pairs like <code>hi.html</code> +{" "}
                  <code>hi.css</code>, standalone HTML, <code>.tsx</code> files and mixed{" "}
                  <code>.txt</code> snippets)
                </li>
                <li>render them all in a gallery, each one live and isolated</li>
                <li>let you edit any of them and save changes straight back to disk</li>
              </ul>
              <button className="btn primary" onClick={openPicker}>
                <FolderOpen size={14} />
                Choose folder
              </button>
            </section>
          </div>
        ) : inDetail ? (
          <DetailView />
        ) : (
          <Gallery />
        )}
      </main>

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
