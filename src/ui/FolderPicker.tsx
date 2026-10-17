/**
 * FolderPicker — pick any folder on the machine to load as a playground.
 *
 * Two ways in: browse visually (starting from the home folder) or paste
 * a path straight in. Recent folders are remembered between visits.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowUp, CornerDownLeft, Folder, FolderOpen, Home } from "lucide-react";
import { Modal } from "./Modal";
import { useStore } from "../state/store";
import { serverBackend } from "../backends/server";
import { getRecents, type RecentFolder } from "../core/persist";
import type { BrowseResult } from "../backends/types";

export function FolderPicker() {
  const { pickerOpen, closePicker, loadFolder } = useStore();
  const [current, setCurrent] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentFolder[]>([]);
  const [manual, setManual] = useState("");

  const go = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await serverBackend.browse(path);
      setCurrent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    setRecents(getRecents());
    setError(null);
    if (!current) {
      serverBackend
        .home()
        .then(go)
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerOpen]);

  const pick = (path: string) => {
    closePicker();
    void loadFolder(path);
  };

  const parent = current?.parent ?? null;

  return (
    <Modal open={pickerOpen} title="Choose a folder" onClose={closePicker} width={680}>
      {recents.length > 0 && (
        <section className="picker-section">
          <h3>Recent folders</h3>
          <div className="picker-recents">
            {recents.map((r) => (
              <button key={r.root} className="picker-recent" onClick={() => pick(r.root)}>
                <FolderOpen size={15} />
                <span className="picker-recent-label">{r.label}</span>
                <span className="picker-recent-path mono faint">{r.root}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="picker-section">
        <h3>Browse</h3>
        <div className="picker-pathbar">
          <button
            className="btn ghost small"
            disabled={!parent || loading}
            onClick={() => parent && void go(parent)}
            title="Go up"
          >
            <ArrowUp size={14} />
          </button>
          <span className="picker-pathbar-text mono" title={current?.path}>
            {current?.path ?? "…"}
          </span>
          {current && (
            <button
              className="btn ghost small"
              disabled={loading}
              onClick={() => void serverBackend.home().then(go)}
              title="Jump to home folder"
            >
              <Home size={14} />
            </button>
          )}
        </div>

        <div className="picker-dirlist">
          {loading && <div className="picker-hint">Reading folder…</div>}
          {!loading && current && current.entries.length === 0 && (
            <div className="picker-hint faint">No subfolders here — you can still use this folder.</div>
          )}
          {!loading &&
            current?.entries.map((entry) => (
              <button key={entry.path} className="picker-entry" onClick={() => void go(entry.path)}>
                <Folder size={15} />
                <span>{entry.name}</span>
              </button>
            ))}
        </div>

        <div className="picker-manual">
          <input
            className="input mono"
            placeholder="/path/to/your/components"
            value={manual}
            spellCheck={false}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manual.trim()) pick(manual.trim());
            }}
          />
          <button
            className="btn"
            disabled={!manual.trim()}
            onClick={() => void go(manual.trim())}
            title="Look inside the typed path"
          >
            Go
          </button>
        </div>
      </section>

      {error && <div className="picker-error">{error}</div>}

      <div className="picker-actions">
        <button className="btn primary" disabled={!current} onClick={() => current && pick(current.path)}>
          <CornerDownLeft size={14} />
          Use this folder
        </button>
        <span className="faint" style={{ fontSize: 12 }}>
          every file inside becomes previewable, editable and saveable
        </span>
      </div>
    </Modal>
  );
}
